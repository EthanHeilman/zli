import * as k8s from '@kubernetes/client-node';

import { configService, logger, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testCluster, testTargets, systemTestEnvName } from '../system-test';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanDistroImage, getDOImageName } from '../../digital-ocean/digital-ocean-target.service.types';
import { sleepTimeout, TestUtils } from '../utils/test-utils';
import { ConnectTestUtils, setupBackgroundDaemonMocks } from '../utils/connect-utils';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { execOnPod, getKubeConfig } from '../utils/kube-utils';
import { getPodWithLabelSelector } from '../utils/kube-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { TestTarget } from '../system-test.types';
import { callZli } from '../utils/zli-utils';
import { KubeTestUserName } from './kube';
import { KubeHttpService } from '../../../http-services/targets/kube/kube.http-services';
import { BzeroTargetHttpService } from '../../../http-services/targets/bzero/bzero.http-services';
import { TargetStatus } from '../../../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { StatusHttpService } from '../../../http-services/status/status.http-service';
import { BzeroAgentSummary } from '../../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { KubeClusterSummary } from '../../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { EventsHttpService } from '../../../http-services/events/events.http-server';
import { getTargetInfo } from '../utils/ssh-utils';
import { dir, DirectoryResult } from 'tmp-promise';
import path from 'path';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';

// Container and Systemd Service Names
// https://github.com/bastionzero/cwc-infra/blob/7b17c303f4acec7553e05688958354c70a7444c1/Bzero-Common/bzero_common/utils.py#L58-L59
const bastionContainer = 'bastion';
const bastionService = 'bzero-server';
const connectionOrchestratorContainer = 'connection-orchestrator';
const connectionOrchestratorService = 'connection-orchestrator';
const connectionNodeContainer = 'connection-node';
const connectionNodeService = 'connection-node';

// Create mapping object and function for test rails case IDs
interface testRailsCaseIdMapping {
    agentRecoveryBastionRestart: string;
    agentRecoveryConnectionOrchestratorRestart: string;
    agentRecoveryConnectionNodeRestart: string;
    agentRestartByName: string;
    agentRestartByEnv: string;
    agentRestartById: string;
}

function fromTestTargetToCaseIdMapping(testTarget: TestTarget): testRailsCaseIdMapping {
    // agent recovery tests only run in CI and not in pipeline so for now we
    // only need to map a single bzero target
    switch (testTarget.dropletImage) {
    case DigitalOceanDistroImage.BzeroVTUbuntuTestImage:
        return {
            agentRecoveryBastionRestart: '247517',
            agentRecoveryConnectionOrchestratorRestart: '326519',
            agentRecoveryConnectionNodeRestart: '326520',
            agentRestartByName: '258916',
            agentRestartByEnv: '258917',
            agentRestartById: '258918',
        };
    default:
        throw new Error(`Unexpected distro image: ${testTarget.dropletImage}`);
    }
}

export const agentRecoverySuite = (testRunnerKubeConfigFile: string, testRunnerUniqueId: string) => {
    describe('Agent Recovery Suite', () => {
        const targetConnectPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'agent-recovery-target-connect');

        let k8sApi: k8s.CoreV1Api;
        let k8sExec: k8s.Exec;
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;
        let connectionService: ConnectionHttpService;
        let connectTestUtils: ConnectTestUtils;
        let kubeService: KubeHttpService;
        let bzeroTargetService: BzeroTargetHttpService;
        let statusService: StatusHttpService;

        // Temp directory to hold kubeconfig file, so that `zli connect` does
        // not affect default kubeconfig of user/machine running system tests
        let tempDir: DirectoryResult;

        beforeAll(async () => {
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            kubeService = new KubeHttpService(configService, logger);
            bzeroTargetService = new BzeroTargetHttpService(configService, logger);
            statusService = new StatusHttpService(configService, logger);

            // Setup the kube client from the test runner configuration
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(testRunnerKubeConfigFile);
            k8sApi = kc.makeApiClient(k8s.CoreV1Api);
            k8sExec = new k8s.Exec(kc);

            // Then create our targetConnect policy
            const me = configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            await policyService.AddTargetConnectPolicy({
                name: targetConnectPolicyName,
                subjects: [currentSubject],
                groups: [],
                description: `Target connect policy created for agent recovery system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [{type: VerbType.Shell},]
            });

            // Set unsafeCleanup because temp dir will contain files
            tempDir = await dir({ unsafeCleanup: true });
            const testFilePath = path.join(tempDir.path, 'test.yaml');

            // Use this Kubeconfig for connect, disconnect, etc.
            // kc.loadFromDefault() should also see this
            process.env.KUBECONFIG = testFilePath;
        });

        afterAll(async () => {
            await tempDir.cleanup();
            await cleanupTargetConnectPolicies(targetConnectPolicyName);
        });

        // Called before each case
        beforeEach(async () => {
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
            setupBackgroundDaemonMocks();
        }, 60 * 1000);

        afterEach(async () => {
            await connectTestUtils.cleanup();
        });

        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRecoveryBastionRestart}: bastion restart ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Wait for the target to come online in case its offline from a previous recovery test
                await waitForBzeroTargetOnline(connectTarget.id);

                // Stop bastion
                const bastionPod = await getBastionPod(k8sApi, testRunnerUniqueId);
                await stopService(bastionPod, bastionContainer, bastionService);

                // Wait before restarting the service
                await sleepTimeout(5 * 1000);
                await startService(bastionPod, bastionContainer, bastionService);

                // Wait for bastion to come back online
                await waitForBastionOnline();

                // Run normal shell connect test to ensure that new connections can be made after bastion restarted
                await connectTestUtils.runShellConnectTest(testTarget, `bastion restart test - ${systemTestUniqueId}`, true);
            },
            3 * 60 * 1000); // 3 min timeout
        });

        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRecoveryConnectionOrchestratorRestart}: connection orchestrator restart ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Wait for the target to come online in case its offline from a previous recovery test
                await waitForBzeroTargetOnline(connectTarget.id);

                // Stop the connection orchestrator
                const connectionOrchestratorPod = await getConnectionOrchestratorPod(k8sApi, testRunnerUniqueId);
                await stopService(connectionOrchestratorPod, connectionOrchestratorContainer, connectionOrchestratorService);

                // Wait before restarting the service
                await sleepTimeout(5 * 1000);
                await startService(connectionOrchestratorPod, connectionOrchestratorContainer, connectionOrchestratorService);

                // Wait for connection orchestrator to come back online
                await waitForConnectionOrchestratorOnline(connectTarget.awsRegion);

                // Give some time for the orchestrator to poll once at startup
                // otherwise the orchestrator will have no available capacity
                // and the connect test will fail
                await sleepTimeout(5 * 1000);

                // Run normal shell connect test to ensure that new connections can be made after connection orchestrator restarted
                await connectTestUtils.runShellConnectTest(testTarget, `connection orchestrator restart test - ${systemTestUniqueId}`, true);
            },
            3 * 60 * 1000); // 3 min timeout
        });

        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRecoveryConnectionNodeRestart}: connection node restart ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Wait for the target to come online in case its offline from a previous recovery test
                const bzeroTarget = await waitForBzeroTargetOnline(connectTarget.id);

                // Once target is online its control channel info should be
                // populated in the bzeroTarget
                expect(bzeroTarget.controlChannel).toBeDefined();
                expect(bzeroTarget.controlChannel.controlChannelId).toBeDefined();
                expect(bzeroTarget.controlChannel.connectionNodeId).toBeDefined();
                expect(bzeroTarget.controlChannel.startTime).toBeDefined();

                // Stop the connection node that contains the agent control channel
                const restartTime = new Date();
                const connectionNodePod = await getConnectionNodePod(k8sApi, testRunnerUniqueId, bzeroTarget.controlChannel.connectionNodeId);
                await stopService(connectionNodePod, connectionNodeContainer, connectionNodeService);

                // Wait for the agent control channel to disconnect
                await waitForAgentOfflineEvent(connectTarget.id, restartTime);

                // Restart the connection node that contains the agent control channel
                await startService(connectionNodePod, connectionNodeContainer, connectionNodeService);

                // Wait for connection node to be healthy again
                await waitForConnectionNodeOnline(bzeroTarget.region, bzeroTarget.controlChannel.connectionNodeId);

                // Wait for the agent control channel to reconnect
                await waitForAgentOnlineEvent(connectTarget.id, restartTime);

                // Run normal shell connect test to ensure that still works after control channel reconnects
                await connectTestUtils.runShellConnectTest(testTarget, `connection node restart test - ${systemTestUniqueId}`, true);
            },
            15 * 60 * 1000); // 15 min timeout
        });

        it('252823: kube agent bastion restart test', async() => {
            // Wait for the target to come online in case its offline from a previous recovery test
            await waitForKubeTargetOnline(testCluster.bzeroClusterTargetSummary.id);

            // Start the kube daemon
            await callZli(['connect', `${KubeTestUserName}@${testCluster.bzeroClusterTargetSummary.name}`, '--targetGroup', 'system:masters']);

            // Stop bastion
            const bastionPod = await getBastionPod(k8sApi, testRunnerUniqueId);
            await stopService(bastionPod, bastionContainer, bastionService);

            // Wait before restarting the service
            await sleepTimeout(5 * 1000);
            await startService(bastionPod, bastionContainer, bastionService);

            // Wait for bastion to come back online
            await waitForBastionOnline();

            // Test the kube connection works after bastion comes back online
            await testKubeConnection();

            await callZli(['disconnect', 'kube']);
        }, 3 * 60 * 1000); // 3 min timeout;

        it('326521: kube agent connection node restart test', async() => {
            // Wait for the target to come online in case its offline from a previous recovery test
            const kubeTarget = await waitForKubeTargetOnline(testCluster.bzeroClusterTargetSummary.id);

            // Once target is online its control channel info should be
            // populated
            expect(kubeTarget.controlChannel).toBeDefined();
            expect(kubeTarget.controlChannel.controlChannelId).toBeDefined();
            expect(kubeTarget.controlChannel.connectionNodeId).toBeDefined();
            expect(kubeTarget.controlChannel.startTime).toBeDefined();

            // Stop the connection node that contains the agent control channel
            const restartTime = new Date();
            const connectionNodePod = await getConnectionNodePod(k8sApi, testRunnerUniqueId, kubeTarget.controlChannel.connectionNodeId);
            await stopService(connectionNodePod, connectionNodeContainer, connectionNodeService);

            // Wait for the agent control channel to disconnect
            await waitForAgentOfflineEvent(testCluster.bzeroClusterTargetSummary.id, restartTime);

            // Start the connection node
            await startService(connectionNodePod, connectionNodeContainer, connectionNodeService);

            // Wait for connection node to be healthy again
            await waitForConnectionNodeOnline(kubeTarget.region, kubeTarget.controlChannel.connectionNodeId);

            // Wait for the agent control channel to reconnect
            await waitForAgentOnlineEvent(testCluster.bzeroClusterTargetSummary.id, restartTime);

            // Start the kube daemon after the control channel is back online
            await callZli(['connect', `${KubeTestUserName}@${testCluster.bzeroClusterTargetSummary.name}`, '--targetGroup', 'system:masters']);

            // Test the kube connection still works after the control channel reconnects
            await testKubeConnection();

            await callZli(['disconnect', 'kube']);
        }, 15 * 60 * 1000); // 15 min timeout;

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRestartByName}: BZero Agent -- zli target restart <name>  - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const { targetName, targetId } = await getTargetInfo(testTarget);

                // Wait for the target to come online in case its offline from a previous recovery test
                await waitForBzeroTargetOnline(targetId);

                const restartTime = new Date();
                await callZli(['target', 'restart', targetName]);

                await waitForAgentToRestart(targetId, restartTime);

                // check that we can still connect to the agent
                await connectTestUtils.runShellConnectTest(testTarget, `zli target restart by name test - ${systemTestUniqueId}`, true);

                // finally, check that the restart was reported correctly
                const eventsService = new EventsHttpService(configService, logger);
                const latestEvents = await eventsService.GetAgentStatusChangeEvents(targetId, restartTime);
                const restart = latestEvents.filter(e => e.statusChange === 'OfflineToRestarting');
                expect(restart.length).toEqual(1);
                expect(restart[0].reason).toContain(`received manual restart from subject: {RestartedBy:${configService.me().email}`);

            }, 5 * 60 * 1000);
        });

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRestartByEnv}: BZero Agent -- zli target restart <name.env>  - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const { targetName, targetId } = await getTargetInfo(testTarget);

                // Wait for the target to come online in case its offline from a previous recovery test
                await waitForBzeroTargetOnline(targetId);

                const restartTime = new Date();
                await callZli(['target', 'restart', `${targetName}.${systemTestEnvName}`]);

                await waitForAgentToRestart(targetId, restartTime);

                // check that we can still connect to the agent
                await connectTestUtils.runShellConnectTest(testTarget, `zli target restart by name.env test - ${systemTestUniqueId}`, true);
            }, 5 * 60 * 1000);
        });

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRestartById}: BZero Agent -- zli target restart <id>  - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const { targetId } = await getTargetInfo(testTarget);

                // Wait for the target to come online in case its offline from a previous recovery test
                await waitForBzeroTargetOnline(targetId);

                const restartTime = new Date();
                await callZli(['target', 'restart', `${targetId}`]);

                await waitForAgentToRestart(targetId, restartTime);

                // check that we can still connect to the agent
                await connectTestUtils.runShellConnectTest(testTarget, `zli target restart by id test - ${systemTestUniqueId}`, true);
            }, 5 * 60 * 1000);
        });

        it(`258919: Kube Agent -- zli target restart <name> `, async () => {
            // Wait for the target to come online in case its offline from a previous recovery test
            await waitForKubeTargetOnline(testCluster.bzeroClusterTargetSummary.id);

            const restartTime = new Date();
            await callZli(['target', 'restart', testCluster.bzeroClusterTargetSummary.name]);

            await waitForAgentToRestart(testCluster.bzeroClusterTargetSummary.id, restartTime);

            // start the kube daemon
            await callZli(['connect', `${KubeTestUserName}@${testCluster.bzeroClusterTargetSummary.name}`, '--targetGroup', 'system:masters']);
            await testKubeConnection();
            await callZli(['disconnect', 'kube']);
        }, 5 * 60 * 1000);


        async function stopService(pod: k8s.V1Pod, containerName: string, serviceName: string) {
            logger.info(`stopping ${containerName} container`);

            // In practice both the SIGKILL and the stop commands result in the
            // same behavior because the systemctl service only runs the wrapper
            // start.sh script which calls dotnet run. We would need to send a
            // SIGKILL directly to the process to simulate a sudden crash
            // https://serverfault.com/questions/936037/killing-systemd-service-with-and-without-systemctl
            // const harshStopCommand = ['/usr/local/bin/systemctl', 'kill',
            // '-s', 'SIGKILL', serviceName];

            const gracefulStopCommand = ['/usr/local/bin/systemctl', 'stop', serviceName];
            await execOnPod(k8sExec, pod, containerName, gracefulStopCommand, logger);
        }

        async function startService(pod: k8s.V1Pod, containerName: string, serviceName: string) {
            // Start the systemd service on the container
            logger.info(`starting ${containerName} container`);
            const startCommand = ['/usr/local/bin/systemctl', 'start', serviceName];
            await execOnPod(k8sExec, pod, containerName, startCommand, logger);
        }

        /**
         * Waits for agent online->offline event after the control channel
         * connection is interrupted
         * @param targetId The targetId of the agent we are testing
         * @param startTimeFilter The time to use as the start time filter so we
         * dont find older events that are not related to the current test.
         */
        async function waitForAgentOfflineEvent(targetId: string, startTimeFilter: Date) {
            // We should first find an online->offline event after the control channel disconnects
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'OnlineToOffline'
            }, startTimeFilter, undefined, 10 * 60 * 1000);

            logger.info(`${new Date()} -- Found online to offline event`);
        }

        /**
         * Waits for agent online->offline event after the control channel
         * reconnects
         * @param targetId The targetId of the agent we are testing
         * @param startTimeFilter The time to use as the start time filter so we
         * dont find older events that are not related to the current test.
         */
        async function waitForAgentOnlineEvent(targetId: string, startTimeFilter: Date) {
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'OfflineToOnline',
            }, startTimeFilter, undefined, 10 * 60 * 1000);

            logger.info(`${new Date()} -- Found offline to online event`);
        }

        async function getBastionPod(k8sApi: k8s.CoreV1Api, uniqueId: string) {
            const resp = await getPodWithLabelSelector(k8sApi, 'default', { 'uniqueId': uniqueId, 'podType': 'bastion'});

            // Should be exactly 1 bastion pod
            const podCount = resp.body.items.length;
            if(podCount != 1) {
                throw new Error(`Found ${podCount} bastion pods.`);
            }

            return resp.body.items[0];
        }

        async function getConnectionOrchestratorPod(k8sApi: k8s.CoreV1Api, uniqueId: string) {
            const resp = await getPodWithLabelSelector(k8sApi, 'connection-service', { 'uniqueId': uniqueId, 'podType': 'connection-orchestrator'});

            // Should be exactly 1 connection orchestrator pod
            const podCount = resp.body.items.length;
            if(podCount != 1) {
                throw new Error(`Found ${podCount} connection orchestrator pods.`);
            }

            return resp.body.items[0];
        }

        async function getConnectionNodePod(k8sApi: k8s.CoreV1Api, uniqueId: string, connectionNodeId: string) {
            const resp = await getPodWithLabelSelector(k8sApi, 'connection-service', { 'uniqueId': uniqueId, 'podType': 'connection-node'});

            const connectionNodePod = resp.body.items.find(p => p.metadata.name.includes(connectionNodeId));
            if(! connectionNodePod) {
                throw new Error(`Couldnt find connection node pod with id ${connectionNodeId}.`);
            }

            return connectionNodePod;
        }

        /**
         * After an agent restart, waits for the following events:
         *      online->offline
         *      offline->restarting
         *      restarting->online
         * @param targetId The targetId of the agent we are testing
         */
        async function waitForAgentToRestart(targetId: string, restartTime: Date) {
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'OnlineToOffline'
            }, restartTime, undefined, 30 * 1000);
            logger.info(`${new Date()} -- Found online to offline event`);

            // second, check that it restarted
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'OfflineToRestarting'
            }, restartTime, undefined, 90 * 1000);
            logger.info(`${new Date()} -- Found offline to restarting event`);

            // second, check that it restarted
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'RestartingToOnline'
            }, restartTime, undefined, 10 * 1000);
            logger.info(`${ new Date() } -- Found restarting to online event`);
        }

        /**
         * helper function to test that we can connect to kube targets after restart
         */
        async function testKubeConnection() {
            // Attempt a simple listNamespace kubectl test after reconnecting
            const bzkc = getKubeConfig();
            const bzk8sApi = bzkc.makeApiClient(k8s.CoreV1Api);

            const listNamespaceResp = await bzk8sApi.listNamespace();
            const resp = listNamespaceResp.body;
            expect(resp.items.find(t => t.metadata.name === testCluster.helmChartNamespace)).toBeTruthy();
        }

        async function waitForBzeroTargetOnline(targetId: string, timeout: number = 2 * 60 * 1000) {
            let bzeroTarget: BzeroAgentSummary;
            logger.info(`${new Date()} -- waiting for bzero target ${targetId} to come online...`);
            await testUtils.waitForExpect(async () => {
                bzeroTarget = await bzeroTargetService.GetBzeroTarget(targetId);
                expect(bzeroTarget.status).toBe(TargetStatus.Online);
            }, timeout);
            logger.info(`${new Date()} -- ${targetId} is online`);

            return bzeroTarget;
        }

        async function waitForKubeTargetOnline(targetId: string, timeout: number = 2 * 60 * 1000) {
            let kubeTarget: KubeClusterSummary;
            logger.info(`${new Date()} -- waiting for kube target ${targetId} to come online...`);
            await testUtils.waitForExpect(async () => {
                kubeTarget = await kubeService.GetKubeCluster(targetId);
                expect(kubeTarget.status).toBe(TargetStatus.Online);
            }, timeout);
            logger.info(`${new Date()} -- ${targetId} is online`);

            return kubeTarget;
        }

        async function waitForBastionOnline(timeout: number = 1 * 60 * 1000) {
            logger.info(`${new Date()} -- waiting for bastion to come online`);
            await testUtils.waitForExpect(async () => {
                await statusService.BastionHealth();
            }, timeout);
            logger.info(`${new Date()} -- bastion online`);
        }

        async function waitForConnectionOrchestratorOnline(region: string, timeout: number = 1 * 60 * 1000) {
            logger.info(`${new Date()} -- waiting for connection orchestrator to come online`);
            await testUtils.waitForExpect(async () => {
                await statusService.ConnectionOrchestratorHealth(region);
            }, timeout);
            logger.info(`${new Date()} -- connection orchestrator online`);
        }

        async function waitForConnectionNodeOnline(region: string, connectionNodeId: string, timeout: number = 1 * 60 * 1000) {
            logger.info(`${new Date()} -- waiting for connection node to come online`);
            await testUtils.waitForExpect(async () => {
                await statusService.ConnectionNodeHealth(region, connectionNodeId);
            }, timeout);
            logger.info(`${new Date()} -- connection node online`);
        }
    });
};