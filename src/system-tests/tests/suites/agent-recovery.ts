import * as k8s from '@kubernetes/client-node';

import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { sleepTimeout, TestUtils } from '../utils/test-utils';
import { ConnectTestUtils } from '../utils/connect-utils';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { execOnPod } from '../../../utils/kube-utils';
import { getPodWithLabelSelector } from '../../../utils/kube-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';

export const agentRecoverySuite = (testRunnerKubeConfigFile: string, testRunnerUniqueId: string) => {
    describe('Agent Recovery Suite', () => {
        let k8sApi: k8s.CoreV1Api;
        let k8sExec: k8s.Exec;
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;
        let connectionService: ConnectionHttpService;
        let connectTestUtils: ConnectTestUtils;

        beforeAll(async () => {
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);
            connectionService = new ConnectionHttpService(configService, logger);

            // const kubeConfigFileContent = fs.readFileSync(testRunnerKubeConfigFile).toString();
            // logger.info(`Test runner kube config file is ${testRunnerKubeConfigFile} with contents: ${kubeConfigFileContent}`);
            logger.info(`Test runner uniqueId is: ${testRunnerUniqueId}`);

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
        });

        // Called before each case
        beforeEach(() => {
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
        });

        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`247517: bastion restart ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const testStartTime = new Date();
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

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
                await testUtils.EnsureAgentStatusEvent(connectTarget.id, {
                    statusChange: 'OnlineToOffline'
                }, testStartTime, undefined, 2 * 60 * 1000);

                logger.info('Found online to offline event');

                // Then the agent should try and reconnect its control channel
                // websocket to bastion which will move the agent back to
                // online. We use a longer timeout here because while the
                // bastion is down the agent goes into a reconnect loop with
                // exponential backoff that will cause it to wait longer before
                // reconnecting
                await testUtils.EnsureAgentStatusEvent(connectTarget.id, {
                    statusChange: 'OfflineToOnline',
                }, testStartTime, undefined, 5 * 60 * 1000);

                logger.info('Found offline to online event');

                await connectTestUtils.runShellConnectTest(testTarget, `bastion restart test - ${systemTestUniqueId}`, true);
            },
            10 * 60 * 1000); // 10 min timeout
        });

        async function getBastionPod(k8sApi: k8s.CoreV1Api, uniqueId: string) {
            const resp = await getPodWithLabelSelector(k8sApi, 'default', { 'uniqueId': uniqueId, 'podType': 'bastion'});

            const podCount = resp.body.items.length;
            if(podCount != 1) {
                throw new Error(`Found ${podCount} bastion pods.`);
            }

            return resp.body.items[0];
        }

        // adding a success case for connecting to bzero targets via ssh using .environment
        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            // FIXME: add case id!!
            it(`${testTarget.sshCaseId}: restart target by name - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const { targetName, targetId } = await getTargetInfo(testTarget);
                await callZli(['target', 'restart', targetName]);

                // first, check that the agent restarted
                await testUtils.EnsureAgentStatusEvent(targetId, {
                    statusChange: 'OnlineToOffline'
                }, testStartTime, undefined, 30 * 1000);

                // second, check that it restarted
                await testUtils.EnsureAgentStatusEvent(targetId, {
                    statusChange: 'OfflineToRestarting'
                }, testStartTime, undefined, 2 * 60 * 1000);

                // second, check that it restarted
                await testUtils.EnsureAgentStatusEvent(targetId, {
                    statusChange: 'RestartingToOnline'
                }, testStartTime, undefined, 30 * 1000);

                // TODO: oh and can check the restart Origin!

                // finally, check that we can still connect to the agent
                await connectTestUtils.runShellConnectTest(testTarget, `zli target restart test - ${systemTestUniqueId}`, true);

            }, 120 * 1000);
        });
    });
};