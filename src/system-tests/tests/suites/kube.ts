import * as k8s from '@kubernetes/client-node';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { callZli } from '../utils/zli-utils';
import { HttpError, V1Pod } from '@kubernetes/client-node';
import { loggerConfigService, systemTestEnvNameCluster, systemTestUniqueId, testCluster } from '../system-test';
import { configService, logger } from '../system-test';
import { TestUtils } from '../utils/test-utils';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { setupBackgroundDaemonMocks } from '../utils/connect-utils';

const fs = require('fs');

export const KubeTestUserName = 'foo';
const BadKubeTestUserName = 'baduser';
export const KubeTestTargetGroups = ['system:masters', 'foo'];
export const KubeBctlNamespace = 'bastionzero';
export const KubeHelmQuickstartChartName = 'bctlquickstart';

export const kubeSuite = () => {
    describe('kube suite', () => {
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;
        let testStartTime: Date;

        let testPassed = false;
        const kubeConfigYamlFilePath = `/tmp/bzero-agent-kubeconfig-${systemTestUniqueId}.yml`;

        beforeAll(() => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);
        });

        beforeEach(() => {
            testStartTime = new Date();
            setupBackgroundDaemonMocks();
        });

        afterAll(async () => {
            // Also attempt to close the daemons to avoid any leaks in the tests
            await callZli(['disconnect', 'kube']);
        });

        afterEach(async () => {
            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);

            // Always make sure our ports are free, else throw an error
            const kubeConfig = configService.getKubeConfig();
            if (kubeConfig.localPort !== null) {
                await testUtils.CheckPort(kubeConfig.localPort);
            }

            if (!testPassed) {
                // If the test did not pass attempt to close the daemon
                await callZli(['disconnect', 'kube']);
            }

            // Reset test passed
            testPassed = false;
        }, 15 * 1000);

        const ensureConnectionEvent = async (eventType: ConnectionEventType) => {
            await testUtils.EnsureConnectionEventCreated({
                targetId: testCluster.bzeroClusterTargetSummary.id,
                targetName: testCluster.bzeroClusterTargetSummary.name,
                targetUser: KubeTestUserName,
                targetType: 'CLUSTER',
                environmentId: testCluster.bzeroClusterTargetSummary.environmentId,
                environmentName: systemTestEnvNameCluster,
                connectionEventType: eventType
            }, testStartTime);
        };

        test('2159: zli generate kubeConfig', async () => {
            // Generate the kubeConfig YAML and write to a file to be read by
            // the kubectl ts library
            await callZli(['generate', 'kubeConfig', '-o', kubeConfigYamlFilePath]);

            // Now ensure that the file exists
            expect(fs.existsSync(kubeConfigYamlFilePath));

            testPassed = true;
        });

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

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            // Start tunnel as system master so we can actually make a request
            // If we add multiple groups, we will not be able to execute the
            // request: Ref: https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-whether-a-request-is-allowed-or-denied
            const targetGroupArgs: string[] = ['--targetGroup', 'system:masters'];
            let finalArgs: string[] = ['connect', `${KubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            finalArgs = finalArgs.concat(targetGroupArgs);
            await callZli(finalArgs);

            // Ensure the created and connected event exist
            await ensureConnectionEvent(ConnectionEventType.Created);
            await ensureConnectionEvent(ConnectionEventType.ClientConnect);

            // Delete the agent pod
            let oldAgentPodName = '';
            try {
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

            // Disconnect
            await callZli(['disconnect', 'kube']);

            // Ensure that the disconnect and close events exist
            await ensureConnectionEvent(ConnectionEventType.ClientDisconnect);
            await ensureConnectionEvent(ConnectionEventType.Closed);

            // Ensure that we see a log of this under the kube logs
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', [`/api/v1/namespaces/${doCluster.helmChartNamespace}/pods`], []));
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', [`/api/v1/namespaces/${doCluster.helmChartNamespace}/pods/${oldAgentPodName}`], []));

            // Wait for the agent pod to come online. The next test will ensure
            // we can still connect
            logger.info('Waiting for agent pod to restart...');
            const newAgentPod = await waitForNewAgentPodToBeRunning(oldAgentPodName);
            logger.info(`New agent pod is running! Name: ${newAgentPod.metadata.name}`);

            const sleepTimeoutSeconds = 15;
            logger.info(`Sleeping ${sleepTimeoutSeconds} seconds to give time for agent to reconnect...`);
            await delay(1000 * sleepTimeoutSeconds);

            testPassed = true;
        }, (180 * 1000) + (1000 * 4 * 60)); // 180s max for all the kube events + connection, and 4m for the test to remain online


        test('2160: zli connect - Kube REST API plugin - get namespaces', async () => {
            const doCluster = testCluster;

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            // Start tunnel as system master so we can actually make a request
            // If we add multiple groups, we will not be able to execute the
            // request: Ref: https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-whether-a-request-is-allowed-or-denied
            let targetGroupArgs: string[] = [];
            KubeTestTargetGroups.forEach(tg => {
                if (tg == 'system:masters') {
                    const newArgs = ['--targetGroup', tg];
                    targetGroupArgs = targetGroupArgs.concat(newArgs);
                }
            });
            let finalArgs: string[] = ['connect', `${KubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            finalArgs = finalArgs.concat(targetGroupArgs);

            await callZli(finalArgs);

            // Ensure the created and connected event exist
            await ensureConnectionEvent(ConnectionEventType.Created);
            await ensureConnectionEvent(ConnectionEventType.ClientConnect);

            // Attempt to list namespaces using agent
            try {
                const listNamespaceResp = await k8sApi.listNamespace();
                const resp = listNamespaceResp.body;

                // Assert that namespace created by helm quickstart exists
                expect(resp.items.find(t => t.metadata.name === doCluster.helmChartNamespace)).toBeTruthy();
            } catch (err) {
                // Pretty print Kube API error
                if (err instanceof HttpError) {
                    console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                }
                throw err;
            }

            // Disconnect
            await callZli(['disconnect', 'kube']);

            // Ensure that the disconnect and close events exist
            await ensureConnectionEvent(ConnectionEventType.ClientDisconnect);
            await ensureConnectionEvent(ConnectionEventType.Closed);

            // Ensure that we see a log of this under the kube logs
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', ['/api/v1/namespaces'], []));
            testPassed = true;
        }, 60 * 1000);

        test('2370: zli connect bad user - Kube REST API plugin - get namespaces', async () => {
            const doCluster = testCluster;

            const finalArgs: string[] = ['connect', `${BadKubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];

            const expectedErrorMessage = 'Expected error';
            jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                throw new Error(expectedErrorMessage);
            });
            const callZliPromise =  callZli(finalArgs); // expect this to exit with exit code 1

            await expect(callZliPromise).rejects.toThrow(expectedErrorMessage);

            testPassed = true;
        }, 30 * 1000);

        test('2161: zli connect - Kube REST API plugin - multiple groups - %p', async () => {
            const doCluster = testCluster;

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            let targetGroupArgs: string[] = [];
            KubeTestTargetGroups.forEach(tg => {
                const newArgs = ['--targetGroup', tg];
                targetGroupArgs = targetGroupArgs.concat(newArgs);
            });
            let finalArgs: string[] = ['connect', `${KubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            finalArgs = finalArgs.concat(targetGroupArgs);
            await callZli(finalArgs);

            // Ensure the created and connected event exist
            await ensureConnectionEvent(ConnectionEventType.Created);
            await ensureConnectionEvent(ConnectionEventType.ClientConnect);

            // Attempt to list namespaces using agent
            try {
                const listNamespaceResp = await k8sApi.listNamespace();
                const resp = listNamespaceResp.body;
                // Since we expect the request to be rejected, ensure that we have no response
                expect(resp.items == undefined);
            } catch (err) {
                // Pretty print Kube API error
                if (err instanceof HttpError) {
                    console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                }
                throw err;
            }

            // Disconnect
            await callZli(['disconnect', 'kube']);

            // Ensure that the disconnect and close events exist
            await ensureConnectionEvent(ConnectionEventType.ClientDisconnect);
            await ensureConnectionEvent(ConnectionEventType.Closed);

            // Ensure that we see a log of this under the kube logs
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, KubeTestTargetGroups, 'N/A', ['/api/v1/namespaces'], []));
            testPassed = true;
        }, 2 * 60 * 1000);

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
            testPassed = true;
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
            testPassed = true;
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
            testPassed = true;
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
            testPassed = true;
        }, 30 * 1000);
    });

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
};