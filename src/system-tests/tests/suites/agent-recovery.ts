import * as k8s from '@kubernetes/client-node';

import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testCluster, testTargets } from '../system-test';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanDistroImage, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { sleepTimeout, TestUtils } from '../utils/test-utils';
import { ConnectTestUtils, setupBackgroundDaemonMocks } from '../utils/connect-utils';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { execOnPod } from '../utils/kube-utils';
import { getPodWithLabelSelector } from '../utils/kube-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { TestTarget } from '../system-test.types';
import { callZli } from '../utils/zli-utils';
import { KubeTestUserName } from './kube';

const kubeConfigYamlFilePath = `/tmp/bzero-agent-kubeconfig-${systemTestUniqueId}.yml`;

// Create mapping object and function for test rails case IDs
interface testRailsCaseIdMapping {
    agentRecoveryBastionRestart: string;
}

function fromTestTargetToCaseIdMapping(testTarget: TestTarget): testRailsCaseIdMapping {
    // agent recovery tests only run in CI and not in pipeline so for now we
    // only need to map a single bzero target
    switch (testTarget.dropletImage) {
    case DigitalOceanDistroImage.BzeroVTUbuntuTestImage:
        return {
            agentRecoveryBastionRestart: '247517'
        };
    default:
        throw new Error(`Unexpected distro image: ${testTarget.dropletImage}`);
    }
}

export const agentRecoverySuite = (testRunnerKubeConfigFile: string, testRunnerUniqueId: string) => {
    describe.skip('Agent Recovery Suite', () => {
        let k8sApi: k8s.CoreV1Api;
        let k8sExec: k8s.Exec;
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;
        let connectionService: ConnectionHttpService;
        let connectTestUtils: ConnectTestUtils;
        let testStartTime: Date;

        beforeAll(async () => {
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);
            connectionService = new ConnectionHttpService(configService, logger);

            // Setup the kube client from the test runner configuration
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(testRunnerKubeConfigFile);
            k8sApi = kc.makeApiClient(k8s.CoreV1Api);
            k8sExec = new k8s.Exec(kc);

            // Then create our targetConnect policy
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target connect policy created for agent recovery system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [{type: VerbType.Shell},]
            });

            // Generate kube yaml to use for kube agent restart test
            await callZli(['generate', 'kubeConfig', '-o', kubeConfigYamlFilePath]);
        });

        // Called before each case
        beforeEach(() => {
            testStartTime = new Date();
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
            setupBackgroundDaemonMocks();
        });

        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`${fromTestTargetToCaseIdMapping(testTarget).agentRecoveryBastionRestart}: bastion restart ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                await restartBastionAndWaitForAgentToReconnect(connectTarget.id);

                // Run normal shell connect test to ensure that still works after reconnecting
                await connectTestUtils.runShellConnectTest(testTarget, `bastion restart test - ${systemTestUniqueId}`, true);
            },
            10 * 60 * 1000); // 10 min timeout
        });

        it('252823: kube agent bastion restart test', async() => {
            // Start the kube daemon
            await callZli(['connect', `${KubeTestUserName}@${testCluster.bzeroClusterTargetSummary.name}`, '--targetGroup', 'system:masters']);

            await restartBastionAndWaitForAgentToReconnect(testCluster.bzeroClusterTargetSummary.id);

            // Attempt a simple listNamespace kubectl test after reconnecting
            const bzkc = new k8s.KubeConfig();
            bzkc.loadFromFile(kubeConfigYamlFilePath);
            const bzk8sApi = bzkc.makeApiClient(k8s.CoreV1Api);

            const listNamespaceResp = await bzk8sApi.listNamespace();
            const resp = listNamespaceResp.body;
            expect(resp.items.find(t => t.metadata.name === testCluster.helmChartNamespace)).toBeTruthy();

            await callZli(['disconnect', 'kube']);
        }, 10 * 60 * 1000); // 10 min timeout;

        /**
         * Restarts bastion pod and then waits for agent online->offline and then offline->online events
         * @param targetId The targetId of the agent we are testing
         */
        async function restartBastionAndWaitForAgentToReconnect(targetId: string) {
            const bastionPod = await getBastionPod(k8sApi, testRunnerUniqueId);
            const bastionContainer = 'bastion';

            // Stop the systemd service on the bastion container to simulate bastion going down temporarily
            logger.info('stopping bastion container');

            // In practice both the SIGKILL and the stop commands still
            // result in agent going offline because of
            // control-channel-disconnect- so the websocket is still closing
            // normally and updating the status in the database. The harsh
            // command is probably not working as intended because it only
            // kills the start.sh script which calls dotnet run but not the
            // actual Webshell.WebApp process itself.

            // With CC -> CN changes we can instead refactor this to
            // simulate a failure of the connection node pod by deleting the
            // pod that contains the control channel and the offline event
            // should happen immediately on bastion

            // send a SIGKILL signal to simulate the bastion crashing
            // instead of gracefully shutting down
            // https://serverfault.com/questions/936037/killing-systemd-service-with-and-without-systemctl
            // const harshStopCommand = ['/usr/local/bin/systemctl', 'kill', '-s', 'SIGKILL', 'bzero-server'];
            const gracefulStopCommand = ['/usr/local/bin/systemctl', 'stop', 'bzero-server'];

            await execOnPod(k8sExec, bastionPod, bastionContainer, gracefulStopCommand, logger);

            // Wait for 1 min before restarting bastion
            logger.info('waiting 1 min before restarting bastion');
            await sleepTimeout(1 * 60 * 1000);

            // Start the systemd service on the bastion container
            logger.info('starting bastion container');
            const startCommand = ['/usr/local/bin/systemctl', 'start', 'bzero-server'];
            await execOnPod(k8sExec, bastionPod, bastionContainer, startCommand, logger);

            // Once bastion comes back online we should be able to query and
            // find a online->offline event for this agent
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'OnlineToOffline'
            }, testStartTime, undefined, 2 * 60 * 1000);

            logger.info('Found online to offline event');

            // Then the agent should try and reconnect its control channel
            // websocket to bastion which will move the agent back to
            // online. We use a longer timeout here because while the
            // bastion is down the agent goes into a reconnect loop with
            // exponential backoff that will cause it to wait longer before
            // reconnecting
            await testUtils.EnsureAgentStatusEvent(targetId, {
                statusChange: 'OfflineToOnline',
            }, testStartTime, undefined, 5 * 60 * 1000);

            logger.info('Found offline to online event');
        }

        async function getBastionPod(k8sApi: k8s.CoreV1Api, uniqueId: string) {
            const resp = await getPodWithLabelSelector(k8sApi, 'default', { 'uniqueId': uniqueId, 'podType': 'bastion'});

            const podCount = resp.body.items.length;
            if(podCount != 1) {
                throw new Error(`Found ${podCount} bastion pods.`);
            }

            return resp.body.items[0];
        }
    });
};