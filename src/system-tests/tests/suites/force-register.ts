import { allTargets, configService, doApiKey, logger, systemTestEnvId, systemTestPolicyTemplate, systemTestRegistrationApiKey, systemTestUniqueId, testTargets } from 'system-tests/tests/system-test';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { TestUtils } from 'system-tests/tests/utils/test-utils';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { cleanupTargetConnectPolicies } from 'system-tests/tests/system-test-cleanup';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { ConnectTestUtils } from 'system-tests/tests/utils/connect-utils';
import { TestTarget } from '../system-test.types';
import { DigitalOceanBZeroTarget, getDOImageName } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { DigitalOceanTargetService } from 'system-tests/digital-ocean/digital-ocean-target-service';
import { callZli } from '../utils/zli-utils';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { BzeroAgentSummary } from 'webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { ConnectionEventType } from 'webshell-common-ts/http/v2/event/types/connection-event.types';

export const forceRegisterSuite = () => {
    describe('force register suite', () => {
        const forceRegisterTargetUser = 'root';
        const targetConnectPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect');

        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let bzeroTargetHttpService: BzeroTargetHttpService;
        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;
        let testStartTime: Date;
        const targetsToDelete: BzeroAgentSummary[] = [];

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            bzeroTargetHttpService = new BzeroTargetHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);

            const me = configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // Then create our targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: targetConnectPolicyName,
                subjects: [currentSubject],
                groups: [],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [{type: VerbType.Shell},]
            });
        }, 60 * 1000);

        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(targetConnectPolicyName);

            // Clean up all new targets created via force registration
            await Promise.all(targetsToDelete.map(async bzeroTarget => {
                await bzeroTargetHttpService.DeleteBzeroTarget(bzeroTarget.id);
            }));
        });

        // Called before each case
        beforeEach(() => {
            testStartTime = new Date();
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
        });

        // Called after each case
        afterEach(async () => {
            await connectTestUtils.cleanup();
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.forceRegisterCaseId}: force register - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {

                // First connect to the target so we can run commands
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);
                connectTarget.targetUser = forceRegisterTargetUser;

                const connectPromise = callZli(['connect', `${forceRegisterTargetUser}@${connectTarget.name}`]);

                // Make sure we see connected event before trying to send input
                await connectTestUtils.ensureConnectionEvent(connectTarget, ConnectionEventType.Created, testStartTime);
                await connectTestUtils.ensureConnectionEvent(connectTarget, ConnectionEventType.ClientConnect, testStartTime);

                // Then run command to force register this target with a new name
                const newTargetName = `${doTarget.bzeroTarget.name}-new`;
                const packageName = 'bzero-beta';
                const forceRegisterCommand = `sudo ${packageName} -y \
-serviceUrl=${configService.getServiceUrl()} \
-registrationKey=${systemTestRegistrationApiKey.secret} \
-environmentId=${systemTestEnvId} \
-targetName=${newTargetName}`;

                logger.info(`Sending force register command: ${forceRegisterCommand}`);
                await connectTarget.writeToStdIn(forceRegisterCommand, 0);

                // Then run command to restart the agent
                const restartCommand = `systemctl restart ${packageName}`;
                logger.info(`Sending restart command: ${restartCommand}`);
                await connectTarget.writeToStdIn(restartCommand, 0);

                // Then exit the connection and wait for zli to exit
                await connectTestUtils.sendExitCommand(connectTarget);
                await connectPromise;

                logger.info(`Stdout from force register/restart commands: \n\n\n${connectTarget.getCapturedOutput()}`);

                // Now wait up for new target to come online. Use timeout of 1
                // min (10s * 6 retries) because new target should come online
                // fairly quickly after being restarted. It will just need to
                // open a new control channel but the droplet will already
                // exist.
                const doService = new DigitalOceanTargetService(doApiKey, configService, logger);
                const newBzeroTarget = await doService.pollBZeroTargetOnline(newTargetName, 10 * 1000, 6);
                targetsToDelete.push(newBzeroTarget);
                const newDigitalOceanBZeroTarget: DigitalOceanBZeroTarget = { type: doTarget.type, droplet: doTarget.droplet, bzeroTarget: newBzeroTarget };
                const newConnectTarget = connectTestUtils.getConnectTarget(newDigitalOceanBZeroTarget, testTarget.awsRegion);

                // Run normal shell connect tests again on the new target
                await connectTestUtils.runShellConnectTestHelper(newConnectTarget, `connect force register test - ${systemTestUniqueId}`, true, null);
            }, 5 * 60 * 1000);
        });
    });
};