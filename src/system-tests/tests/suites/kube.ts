import * as k8s from '@kubernetes/client-node';
import { callZli } from '../utils/zli-utils';
import { HttpError, V1Pod } from '@kubernetes/client-node';
import { systemTestPolicyTemplate, systemTestUniqueId, testCluster } from '../system-test';
import { configService, logger } from '../system-test';
import { TestUtils } from '../utils/test-utils';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { setupBackgroundDaemonMocks } from '../utils/connect-utils';
import { dir, DirectoryResult } from 'tmp-promise';
import path from 'path';
import { getKubeConfig } from '../utils/kube-utils';
import { KubeConfig } from '../../../services/config/config.service.types';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { getMockResultValue } from '../utils/jest-utils';
import { DaemonManagementService, newKubeDaemonManagementService } from '../../../services/daemon-management/daemon-management.service';
import { ProcessManagerService } from '../../../services/process-manager/process-manager.service';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ClusterUser } from '../../../../webshell-common-ts/http/v2/policy/types/cluster-user.types';
import { expectAnythingOrNothing, getListOfAvailPorts, mapToArrayTuples } from '../utils/utils';
import { DaemonStatus } from '../../../services/daemon-management/types/daemon-status.types';
import * as ListConnectionsService from '../../../services/list-connections/list-connections.service';
import * as KubeManagementService from '../../../services/kube-management/kube-management.service';
import { KubeConnectionInfo } from '../../../services/list-connections/list-connections.service.types';
import { ConnectionState } from '../../../../webshell-common-ts/http/v2/connection/types/connection-state.types';

const findPort = require('find-open-port');

export const KubeTestUserName = 'foo';
const BadKubeTestUserName = 'baduser';
export const KubeTestTargetGroups = ['system:masters', 'foo'];
export const KubeBctlNamespace = 'bastionzero';
export const KubeHelmQuickstartChartName = 'bctlquickstart';

interface ConnectedKubeDaemonDetails {
    connectionId: string;
    kubeDaemonDetails: KubeConfig
    contextName: string;
};

export const kubeSuite = () => {
    describe('kube suite', () => {
        let policyService: PolicyHttpService;
        let connectionHttpService: ConnectionHttpService;
        let processManager: ProcessManagerService;
        let testUtils: TestUtils;
        let testStartTime: Date;

        let kubeDaemonManagementService: DaemonManagementService<KubeConfig>;

        // Kube policy ID created for this entire suite in order to do
        // multi-Kube tests that involve other users besides the default one
        // made during helm install
        let kubePolicyID: string;

        // Temp directory to hold kubeconfig file, so that `zli connect` does
        // not affect default kubeconfig of user/machine running system tests
        let tempDir: DirectoryResult;

        // Separate cluster users to connect as during multi-kube tests
        const usersToConnectAsMultiKube = ['fooo', 'bar', 'baz'];

        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionHttpService = new ConnectionHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);

            processManager = new ProcessManagerService();
            kubeDaemonManagementService = newKubeDaemonManagementService(configService);

            // Set unsafeCleanup because temp dir will contain files
            tempDir = await dir({ unsafeCleanup: true });
            const testFilePath = path.join(tempDir.path, 'test.yaml');

            // Use this Kubeconfig for connect, disconnect, etc.
            // kc.loadFromDefault() should also see this
            process.env.KUBECONFIG = testFilePath;

            // Set up the policy before all the tests
            const me = configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: testCluster.bzeroClusterTargetSummary.environmentId
            };
            kubePolicyID = (await policyService.AddKubernetesPolicy({
                name: `${systemTestPolicyTemplate.replace('$POLICY_TYPE', 'kubernetes')}-kube-suite`,
                subjects: [currentSubject],
                groups: [],
                description: `Kube policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                clusterUsers: usersToConnectAsMultiKube.map<ClusterUser>(u => ({ name: u })),
                clusterGroups: [{ name: 'system:masters' }]
            })).id;
        });

        afterAll(async () => {
            await tempDir.cleanup();

            // Cleanup policy after all the tests have finished
            await policyService.DeleteKubernetesPolicy(kubePolicyID);
        });

        beforeEach(async () => {
            testStartTime = new Date();
            setupBackgroundDaemonMocks();
        }, 60 * 1000);

        afterEach(async () => {
            await callZli(['disconnect', 'kube', '--silent']);
        });

        describe('happy path: kube connect', () => {
            /**
             * Wrapper of EnsureConnectionEvent but assumes the event is Kube
             * and passes a filter for a specific connectionId
             * @param daemon The daemon expected to connect
             * @param eventType The eventType to filter for
             */
            const ensureConnectionEvent = async (daemon: ConnectedKubeDaemonDetails, eventType: ConnectionEventType) => {
                await testUtils.EnsureConnectionEventCreated({
                    targetId: testCluster.bzeroClusterTargetSummary.id,
                    targetName: testCluster.bzeroClusterTargetSummary.name,
                    targetUser: daemon.kubeDaemonDetails.targetUser,
                    targetType: 'CLUSTER',
                    environmentId: testCluster.bzeroClusterTargetSummary.environmentId,
                    // TODO fix this after helm v2 is released to prod The old
                    // helm chart does not allow specifying an environment to
                    // put the cluster target in and always creates a new
                    // environment with name {clusterName}-env
                    environmentName: `${testCluster.bzeroClusterTargetSummary.name}-env`,
                    // environmentName: systemTestEnvName
                    connectionEventType: eventType,
                    connectionId: daemon.connectionId
                }, testStartTime);
            };

            /**
             * Ensure the created and connected events exist for a list of
             * connected Kube daemons. Polls for the events concurrently for each
             * daemon.
             * @param connectedKubeDaemons List of connected kube daemons
             */
            const ensureConnectedEvents = async (connectedKubeDaemons: ConnectedKubeDaemonDetails[]) => {
                await Promise.all(connectedKubeDaemons.map(async daemon => {
                    await ensureConnectionEvent(daemon, ConnectionEventType.Created);
                    await ensureConnectionEvent(daemon, ConnectionEventType.ClientConnect);
                }));
            };

            /**
             * Ensure the disconnect and closed events exist for a list of
             * connected Kube daemons. Polls for the events concurrently for each
             * daemon.
             * @param connectedKubeDaemons List of connected kube daemons
             */
            const ensureDisconnectedEvents = async (connectedKubeDaemons: ConnectedKubeDaemonDetails[]) => {
                await Promise.all(connectedKubeDaemons.map(async daemon => {
                    await ensureConnectionEvent(daemon, ConnectionEventType.ClientDisconnect);
                    await ensureConnectionEvent(daemon, ConnectionEventType.Closed);
                }));
            };

            /**
             * Connect to Kube target some number of times.
             * @param usersToConnectAs Distinct users to make connections as
             * @param customPorts Array of custom ports to use when making the
             * connections. Set array's values to undefined to omit using the
             * --customPort flag when connecting. Length of this array must
             * equal usersToConnectAs, otherwise an error is thrown.
             * @returns List of connection details
             */
            const connectNumOfTimes = async (usersToConnectAs: string[], customPorts: number[]): Promise<ConnectedKubeDaemonDetails[]> => {
                expect(customPorts.length).toBe(usersToConnectAs.length);

                // Make a Kube connection for each user provided
                const connectedKubeDaemons: ConnectedKubeDaemonDetails[] = [];
                for (let i = 0; i < usersToConnectAs.length; i++) {
                    const user = usersToConnectAs[i];
                    const port = customPorts[i];
                    const connectDetails = await connectToKubeTarget(user, ['system:masters'], port);
                    connectedKubeDaemons.push(connectDetails);
                }

                return connectedKubeDaemons;
            };
            const connectNumOfTimesWithoutCustomPort = async (usersToConnectAs: string[]): Promise<ConnectedKubeDaemonDetails[]> => {
                return connectNumOfTimes(usersToConnectAs, Array(usersToConnectAs.length).fill(undefined));
            };

            /**
             * Connects to Kube target on shared system test cluster. Function
             * should not be called in parallel due to usage of spies.
             * @param targetUser Target user to connect as
             * @param targetGroups Target groups to connect as
             * @param customPort Optional. Custom port flag
             * @returns Object with details about the started kube daemon
             */
            const connectToKubeTarget = async (targetUser: string, targetGroups: string[], customPort?: number): Promise<ConnectedKubeDaemonDetails> => {
                // Start the connection to the kube target
                logger.info('Creating kube target connection');

                const createUniversalConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateUniversalConnection');
                const generateKubeConfigSpy = jest.spyOn(KubeManagementService, 'generateKubeConfig');
                const zliArgs = ['connect', `${targetUser}@${testCluster.bzeroClusterTargetSummary.name}`];
                if (targetGroups.length > 0) {
                    const formattedTargetGroups = targetGroups.reduce<string[]>((acc, group) => acc.concat(['--targetGroup', group]), []);
                    zliArgs.push(...formattedTargetGroups);
                }

                // Add --customPort flag if customPort argument provided
                if (customPort) {
                    zliArgs.push('--customPort', customPort.toString());
                }
                await callZli(zliArgs);

                // Retrieve connection ID from the spy
                expect(createUniversalConnectionSpy).toHaveBeenCalledOnce();
                const gotUniversalConnectionResponse = await getMockResultValue(createUniversalConnectionSpy.mock.results[0]);
                const connectionId = gotUniversalConnectionResponse.connectionId;

                // Grab the Kube daemon config from the config store
                const kubeConfig = kubeDaemonManagementService.getDaemonConfigs().get(connectionId);

                // If dbConfig is not defined, it means it was never added to
                // the map of kube daemons
                expect(kubeConfig).toBeDefined();

                // Retrieve context name from the spy
                expect(generateKubeConfigSpy).toHaveBeenCalledOnce();
                const contextName = getMockResultValue(generateKubeConfigSpy.mock.results[0]).currentContext;

                // Clear the spy, so this function can be called again (in the
                // same test) without leaking state between the spy's
                // invocations
                createUniversalConnectionSpy.mockClear();
                generateKubeConfigSpy.mockClear();

                return {
                    connectionId: connectionId,
                    kubeDaemonDetails: kubeConfig,
                    contextName: contextName
                };
            };

            /**
             * Stops the kube daemon by calling the provided closeAction lambda
             * function. Checks that the daemonPid process is not running with a
             * 5 second grace period. Ensures connection closed events are
             * created.
             * @param connectedKubeDaemon The connected daemon to stop
             * @param closeAction Lambda function that is expected to perform
             * the logic that stops the kube daemon
             */
            const stopKubeDaemon = async (
                connectedKubeDaemon: ConnectedKubeDaemonDetails,
                closeAction: () => Promise<void>
            ) => {
                await closeAction();

                // Ensure the disconnect and close event exist
                await ensureDisconnectedEvents([connectedKubeDaemon]);

                // Expect the daemon process to stop running within 5 seconds
                await testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(connectedKubeDaemon.kubeDaemonDetails.localPid)).toBeFalse(), 5 * 1000);
            };

            const getNamespacesAndAssert = async (daemon: ConnectedKubeDaemonDetails, assertFunc: (resp: k8s.V1NamespaceList) => Promise<void>, shouldSetCurrentContext: boolean = true) => {
                // Attempt to list namespaces using agent
                try {
                    const kc = getKubeConfig();

                    if (shouldSetCurrentContext)
                        kc.setCurrentContext(daemon.contextName);

                    // Sanity check kube client is talking to the right daemon
                    expect(daemon.kubeDaemonDetails.localPort.toString()).toBe(new URL(kc.getCurrentCluster()?.server).port);

                    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
                    const listNamespaceResp = await k8sApi.listNamespace();
                    const resp = listNamespaceResp.body;

                    // Make assertion
                    await assertFunc(resp);
                } catch (err) {
                    // Pretty print Kube API error
                    if (err instanceof HttpError) {
                        err.message = `Kube API returned error: ${JSON.stringify(err.response, null, 4)}: ${err.message}`;
                    }
                    throw err;
                }

                // Ensure that we see a log of this under the kube logs
                expect(await testUtils.EnsureKubeEvent(testCluster.bzeroClusterTargetSummary.name, daemon.kubeDaemonDetails.targetUser, daemon.kubeDaemonDetails.targetGroups, 'N/A', ['/api/v1/namespaces'], [], testStartTime));
            };

            // TODO: this needs to be fixed before it's ready to be added back in
            // we believe there is a race condition with a previous test
            test.skip('2369: zli connect - Kube REST API plugin - Delete agent pod', async () => {
                const doCluster = testCluster;

                // Init Kube client using DigitalOcean kube-config. We fallback to
                // this as we can't use the kube daemon when the pod is restarting
                const digitalOceanKubeConfig = new k8s.KubeConfig();
                digitalOceanKubeConfig.loadFromFile(doCluster.kubeConfigFilePath);
                function waitForNewAgentPodToBeRunning(oldAgentPodName: string): Promise<V1Pod> {
                    return new Promise((resolve, reject) => {
                        const watch = new k8s.Watch(digitalOceanKubeConfig);
                        const req = watch.watch(
                            `/api/v1/namespaces/${doCluster.helmChartNamespace}/pods`,
                            {},
                            (_, obj) => {
                                if (obj.metadata.name != oldAgentPodName && obj.status.phase === 'Running') {
                                    // Cleanup the watch
                                    req.then(res => res.abort()).catch(err => reject(err));
                                    // Resolve!
                                    resolve(obj);
                                }
                            },
                            // done callback is called if the watch terminates normally
                            err => {
                                if (err) {
                                    reject(err);
                                }
                            },
                        );
                    });
                }

                // Start tunnel as system master so we can actually make a request
                // If we add multiple groups, we will not be able to execute the
                // request: Ref: https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-whether-a-request-is-allowed-or-denied
                const connectDetails = await connectToKubeTarget(KubeTestUserName, ['system:masters']);

                // Ensure connection events
                await ensureConnectedEvents([connectDetails]);

                // Delete the agent pod
                let oldAgentPodName = '';
                try {
                    const kc = getKubeConfig();
                    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
                    const listPodsResp = await k8sApi.listNamespacedPod(doCluster.helmChartNamespace);
                    const listPodsParsed = listPodsResp.body;

                    // There should only be 1 pod in the bastionzero namespace
                    oldAgentPodName = listPodsParsed.items[0].metadata.name;
                    await k8sApi.deleteNamespacedPod(oldAgentPodName, doCluster.helmChartNamespace);
                } catch (err) {
                    // Pretty print Kube API error
                    if (err instanceof HttpError) {
                        console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                    }
                    throw err;
                }

                // Disconnect!
                await stopKubeDaemon(
                    connectDetails,
                    () => callZli(['disconnect', 'kube'])
                );

                // Ensure that we see a log of this under the kube logs
                expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', [`/api/v1/namespaces/${doCluster.helmChartNamespace}/pods`], [], testStartTime));
                expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', [`/api/v1/namespaces/${doCluster.helmChartNamespace}/pods/${oldAgentPodName}`], [], testStartTime));

                // Wait for the agent pod to come online. The next test will ensure
                // we can still connect
                logger.info('Waiting for agent pod to restart...');
                const newAgentPod = await waitForNewAgentPodToBeRunning(oldAgentPodName);
                logger.info(`New agent pod is running! Name: ${newAgentPod.metadata.name}`);

                const sleepTimeoutSeconds = 15;
                logger.info(`Sleeping ${sleepTimeoutSeconds} seconds to give time for agent to reconnect...`);
                await delay(1000 * sleepTimeoutSeconds);
            }, (180 * 1000) + (1000 * 4 * 60)); // 180s max for all the kube events + connection, and 4m for the test to remain online

            test('493860: zli connect - multi-kube - Kube REST API plugin - get namespaces', async () => {
                const connectedKubeDaemons: ConnectedKubeDaemonDetails[] = [];

                // Make multiple Kube connections as different cluster users.
                // User must be unique because zli does not permit same target
                // user for another connection
                for (let i = 0; i < usersToConnectAsMultiKube.length; i++) {
                    const user = usersToConnectAsMultiKube[i];

                    let connectDetails: ConnectedKubeDaemonDetails;
                    if (i == usersToConnectAsMultiKube.length - 1) {
                        // For the last user, make a connection using
                        // --customPort flag to increase test coverage
                        const customPort = await findPort();
                        connectDetails = await connectToKubeTarget(user, ['system:masters'], customPort);
                    } else {
                        connectDetails = await connectToKubeTarget(user, ['system:masters']);
                    }
                    connectedKubeDaemons.push(connectDetails);
                }

                // Ensure all daemons have successfully connected by
                // checking for the client connected events on the Bastion
                await ensureConnectedEvents(connectedKubeDaemons);

                // Connect to each spawned kube daemon concurrently, get
                // namespaces, and then close the connection via `zli close`.
                await Promise.all(connectedKubeDaemons.map(async details => {
                    await getNamespacesAndAssert(details, async (resp) => expect(resp.items.find(t => t.metadata.name === testCluster.helmChartNamespace)).toBeTruthy());
                    await stopKubeDaemon(
                        details,
                        () => callZli(['close', details.connectionId])
                    );
                }));
            }, 80 * 1000);

            test('493861: list kube connections - zli ld', async () => {
                // Connect to this kube target twice, using different users
                const users = usersToConnectAsMultiKube.slice(0, 2);
                const expectedPorts = await getListOfAvailPorts(users.length);
                const connectedKubeDaemons = await connectNumOfTimes(users, expectedPorts);

                const getAllDaemonStatusesSpy = jest.spyOn(DaemonManagementService.prototype, 'getAllDaemonStatuses');
                await callZli(['ld', 'kube']);
                expect(getAllDaemonStatusesSpy).toHaveBeenCalled();
                const gotKubeStatuses = (await getMockResultValue(getAllDaemonStatusesSpy.mock.results[0]));
                const gotKubeStatusesAsTuples = mapToArrayTuples(gotKubeStatuses);

                const expectedKubeStatuses = connectedKubeDaemons.reduce<[string, DaemonStatus<KubeConfig>][]>((acc, el, i) => {
                    acc.push([el.connectionId, {
                        type: 'daemon_is_running',
                        connectionId: el.connectionId,
                        config: {
                            type: 'kube',
                            targetCluster: testCluster.bzeroClusterTargetSummary.name,
                            targetUser: users[i],
                            targetGroups: ['system:masters'],
                            localPort: expectedPorts[i],
                            localHost: 'localhost',
                            localPid: expect.anything()
                        },
                        status: {
                            type: 'kube',
                            localUrl: `localhost:${expectedPorts[i]}`,
                            targetCluster: testCluster.bzeroClusterTargetSummary.name,
                            targetUser: users[i],
                            targetGroups: 'system:masters',
                        }
                    }]);
                    return acc;
                }, []);

                expect(gotKubeStatusesAsTuples).toEqual(expect.arrayContaining(expectedKubeStatuses));
            }, 80 * 1000);

            test('493862: list kube connections - zli lc', async () => {
                // Connect to this kube target twice, using different users
                const users = usersToConnectAsMultiKube.slice(0, 2);
                const connectedKubeDaemons = await connectNumOfTimesWithoutCustomPort(users);

                // lc tests e2e the list connections endpoint
                const listKubeConnectionsSpy = jest.spyOn(ListConnectionsService, 'listOpenKubeConnections');
                await callZli(['lc', '-t', 'kube', '--json']);
                expect(listKubeConnectionsSpy).toHaveBeenCalledTimes(1);
                const gotKubeConnectionInfos = (await getMockResultValue(listKubeConnectionsSpy.mock.results[0]));
                const expectedKubeConnectionInfos = connectedKubeDaemons.map<KubeConnectionInfo>(connectionInfo => ({
                    type: 'kube',
                    targetName: testCluster.bzeroClusterTargetSummary.name,
                    connectionId: connectionInfo.connectionId,
                    timeCreated: expect.anything(),
                    targetUser: expect.toBeOneOf(users),
                    targetGroups: ['system:masters']
                }));

                // Use arrayContaining, so that got value can contain extra
                // elements (e.g. other RF users running system tests at the
                // same time)
                expect(gotKubeConnectionInfos).toEqual(expect.arrayContaining(expectedKubeConnectionInfos));
            }, 80 * 1000);

            test('493863: close single kube connection - zli close', async () => {
                // As a user I must be able to close a single Kube connection
                // without closing other Kube connections

                // Connect to this kube target twice, using different users
                const users = usersToConnectAsMultiKube.slice(0, 2);
                const connectedKubeDaemons = await connectNumOfTimesWithoutCustomPort(users);

                // Must ensure connection events, so close results in
                // ClientDisconnect events which are asserted below
                await ensureConnectedEvents(connectedKubeDaemons);

                // Close the first connection using "zli close". Ensures closed
                // connection events are present and that the daemon has stopped
                // running.
                const connectionToClose = connectedKubeDaemons[0];
                const connectionToStayOpen = connectedKubeDaemons[1];
                await stopKubeDaemon(
                    connectionToClose,
                    () => callZli(['close', connectionToClose.connectionId])
                );

                // Check that the other connection is still open
                const openKubeConnections = await connectionHttpService.ListKubeConnections(ConnectionState.Open);
                expect(openKubeConnections).toEqual(expect.arrayContaining([expect.objectContaining({ id: connectionToStayOpen.connectionId })]));
                // Since we're using arrayContaining, the call above can still
                // pass even if it contains the connection which closed.
                // Therefore, we must also check for non-existence
                expect(openKubeConnections).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: connectionToClose.connectionId })]));

                // Check that the connection meant to stay open is still
                // running. Check that the connection meant to close reports
                // that the daemon quit unexpectedly.
                const kubeStatuses = await kubeDaemonManagementService.getAllDaemonStatuses();
                const gotKubeStatusesAsTuples = mapToArrayTuples(kubeStatuses);
                expect(gotKubeStatusesAsTuples).toEqual(expect.arrayContaining([
                    [connectionToStayOpen.connectionId, expect.objectContaining({ type: 'daemon_is_running' })],
                    [connectionToClose.connectionId, expect.objectContaining({ type: 'daemon_quit_unexpectedly' })]
                ]));

                // Check that we can still connect and receive REST API result
                // from kube
                await getNamespacesAndAssert(connectionToStayOpen, async (resp) => expect(resp.items.find(t => t.metadata.name === testCluster.helmChartNamespace)).toBeTruthy());

                // We shouldn't be able to connect to closed kube connection's
                // daemon's server because it died, so a network error should be
                // thrown.
                await expect(getNamespacesAndAssert(connectionToClose, async () => { })).rejects.toThrow();

                // Check that filtering occurs after calling `zli ld kube`
                await callZli(['ld', 'kube']);
                const kc = getKubeConfig();
                expect(kc.contexts).toMatchObject<k8s.Context[]>([{ name: connectionToStayOpen.contextName, cluster: expect.anything(), user: expect.anything(), namespace: expectAnythingOrNothing}]);
            }, 80 * 1000);

            test('493864: close multiple kube connections - zli disconnect kube', async () => {
                // As a user I must be able to close all of my Kube connections
                // at once without logging out.

                // Connect to this kube target twice, using different users
                const users = usersToConnectAsMultiKube.slice(0, 2);
                const connectedKubeDaemons = await connectNumOfTimesWithoutCustomPort(users);

                // Must ensure connection events, so `zli disconnect` results in
                // ClientDisconnect events which are asserted below
                await ensureConnectedEvents(connectedKubeDaemons);

                // Disconnect all Kube daemons spawned on this machine
                await callZli(['disconnect', 'kube']);

                // Ensure the disconnect and close events exist for each daemon
                await ensureDisconnectedEvents(connectedKubeDaemons);

                // Assert that each daemon process has stopped running
                await Promise.all(connectedKubeDaemons.map(details =>
                    testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(details.kubeDaemonDetails.localPid)).toBeFalse(), 5 * 1000)
                ));

                // Check that filtering occurs after calling `zli disconnect
                // kube`
                const kc = getKubeConfig();
                expect(kc.contexts).toMatchObject<k8s.Context[]>([]);
            }, 80 * 1000);

            test('493865: close multiple kube connections - zli close -t kube --all', async () => {
                // As a user I must be able to close all of my Kube connections
                // at once without logging out.

                // Connect to this kube target twice, using different users
                const users = usersToConnectAsMultiKube.slice(0, 2);
                const connectedKubeDaemons = await connectNumOfTimesWithoutCustomPort(users);

                // Must ensure connection events, so `zli close` results in
                // ClientDisconnect events which are asserted below
                await ensureConnectedEvents(connectedKubeDaemons);

                // Close all Kube connections
                await callZli(['close', '-t', 'kube', '--all']);

                // Ensure the disconnect and close events exist for each daemon
                await ensureDisconnectedEvents(connectedKubeDaemons);

                // Assert that each daemon process has stopped running
                await Promise.all(connectedKubeDaemons.map(details =>
                    testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(details.kubeDaemonDetails.localPid)).toBeFalse(), 5 * 1000)
                ));
            }, 80 * 1000);

            test('2160: zli connect - Kube REST API plugin - get namespaces', async () => {
                // Start tunnel as system master so we can actually make a request
                const connectDetails = await connectToKubeTarget(KubeTestUserName, ['system:masters']);

                // Ensure connection events
                await ensureConnectedEvents([connectDetails]);

                // Attempt to list namespaces using agent
                //
                // Set shouldSetCurrentContext to false because there should
                // only be one context (as there is only one connection) and
                // this tests e2e that kube config's current context is set
                // correctly by the zli. There is also a unit test for this.
                await getNamespacesAndAssert(connectDetails, async (resp) => expect(resp.items.find(t => t.metadata.name === testCluster.helmChartNamespace)).toBeTruthy(), false);

                // Disconnect!
                await stopKubeDaemon(
                    connectDetails,
                    () => callZli(['disconnect', 'kube'])
                );
            }, 60 * 1000);

            test('2161: zli connect - Kube REST API plugin - multiple groups - %p', async () => {
                const connectDetails = await connectToKubeTarget(KubeTestUserName, KubeTestTargetGroups);

                // Ensure connection events
                await ensureConnectedEvents([connectDetails]);

                // Attempt to list namespaces using agent
                await getNamespacesAndAssert(connectDetails, async (resp) => expect(resp.items).toBeUndefined(), false);

                // Disconnect!
                await stopKubeDaemon(
                    connectDetails,
                    () => callZli(['disconnect', 'kube'])
                );
            }, 2 * 60 * 1000);
        });

        describe('happy path: kube policy', () => {
            test('2162: zli policy targetuser - add target user to policy', async () => {
                // Grab our cluster information and set up our spy
                const doCluster = testCluster;

                // Call the target group function
                await callZli(['policy', 'add-targetuser', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'someuser']);

                // Ensure we see the targetUser in the backend
                const policies = await policyService.ListKubernetesPolicies();
                expect(policies.find(policy => {
                    if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                        if ('someuser' in policy.clusterUsers) {
                            return true;
                        }
                    }
                }));
            }, 30 * 1000);

            test('2163: zli policy targetuser - delete target user from policy %p', async () => {
                // Grab our cluster information and set up our spy
                const doCluster = testCluster;

                // Call the target group function
                await callZli(['policy', 'delete-targetuser', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'someuser']);

                // Ensure we see the targetUser in the backend
                const policies = await policyService.ListKubernetesPolicies();
                expect(policies.find(policy => {
                    if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                        if ('someuser' in policy.clusterUsers) {
                            return true;
                        }
                    }
                }) === undefined);
            }, 30 * 1000);

            test('2164: zli policy targetgroup - add target group to policy', async () => {
                // Grab our cluster information and set up our spy
                const doCluster = testCluster;

                // Call the target group function
                await callZli(['policy', 'add-targetgroup', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'somegroup']);

                // Ensure we see the targetUser in the backend
                const policies = await policyService.ListKubernetesPolicies();
                expect(policies.find(policy => {
                    if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                        if ('somegroup' in policy.clusterGroups) {
                            return true;
                        }
                    }
                }));
            }, 30 * 1000);

            test('2165: zli policy targetgroup - delete target group from policy', async () => {
                // Grab our cluster information and set up our spy
                const doCluster = testCluster;

                // Call the target group function
                await callZli(['policy', 'delete-targetgroup', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'somegroup']);

                // Ensure we see the targetUser in the backend
                const policies = await policyService.ListKubernetesPolicies();
                expect(policies.find(policy => {
                    if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                        if ('somegroup' in policy.clusterGroups) {
                            return true;
                        }
                    }
                }) === undefined);
            }, 30 * 1000);
        });

        describe('bad path: kube connect', () => {
            test('2370: zli connect bad user - Kube REST API plugin - get namespaces', async () => {
                const doCluster = testCluster;

                const finalArgs: string[] = ['connect', `${BadKubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];

                const callZliPromise = callZli(finalArgs);

                await expect(callZliPromise).rejects.toThrow();
            }, 30 * 1000);
        });
    });

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
};