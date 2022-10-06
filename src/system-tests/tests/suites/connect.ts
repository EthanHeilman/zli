import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets, allTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from '../system-test.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { ConnectTestUtils } from '../utils/connect-utils';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { testIf } from '../utils/utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { EventsHttpService } from '../../../http-services/events/events.http-server';

export const connectSuite = () => {
    describe('connect suite', () => {
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let eventsService: EventsHttpService;
        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;
        let userLogFilterStartTime: Date;
        let testStartTime: Date;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            eventsService = new EventsHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // Then create our targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [{type: VerbType.Shell},]
            });

            const mostRecentUserEvent = await eventsService.GetUserEvents(null, [configService.me().id], 1);
            userLogFilterStartTime = mostRecentUserEvent[0]?.timestamp;
        }, 60 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));
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
            it(`${testTarget.connectCaseId}: zli connect - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                await connectTestUtils.runShellConnectTest(testTarget, `connect test - ${systemTestUniqueId}`, true);
            }, 2 * 60 * 1000);

            // TODO: Disable attach tests for bzero targets until attach
            // flow is stable for bzero targets
            // https://commonwealthcrypto.atlassian.net/browse/CWC-1826
            const runAttachTest = testTarget.installType !== 'pm-bzero' && testTarget.installType !== 'ad-bzero' && testTarget.installType !== 'as-bzero';
            testIf(runAttachTest, `${testTarget.attachCaseId}: zli attach - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Bzero targets will close the connection automatically when
                // exiting. We do not yet support a way to exit the terminal and
                // keep the connection open (detach)
                const shouldExit = connectTarget.type === 'ssm' ? true : false;

                // Run normal connect test first
                const beforeAttachEchoString = `before attach - ${systemTestUniqueId}`;
                const connectionId = await connectTestUtils.runShellConnectTest(testTarget, beforeAttachEchoString, shouldExit);

                // Get a new instance of the ConnectTarget which has a separate
                // mockstdin/mock pty and captured output buffer
                const attachTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Call zli attach
                const attachPromise = callZli(['attach', connectionId]);

                // After attaching we should see another client connection event
                await connectTestUtils.ensureConnectionEvent(attachTarget, ConnectionEventType.ClientConnect, testStartTime);
                const eventExists = await testUtils.EnsureUserEventExists('connectionservice:connect', true, attachTarget.id, new Date(userLogFilterStartTime));
                expect(eventExists).toBeTrue();

                // Make sure terminal output is replayed before sending new input
                await testUtils.waitForExpect(
                    async () => {
                        const capturedOutput = attachTarget.getCapturedOutput();
                        const expectedRegex = [
                            expect.stringMatching(new RegExp(beforeAttachEchoString))
                        ];
                        expect(capturedOutput).toEqual(
                            expect.arrayContaining(expectedRegex),
                        );
                    },
                    60 * 1000, // Timeout
                    1 * 1000   // Interval
                );

                // Test sending an echo command in the attached terminal
                await connectTestUtils.testEchoCommand(attachTarget, `after attach - ${systemTestUniqueId}`);

                // Exit the connection
                await connectTestUtils.sendExitCommand(attachTarget);

                // Wait for the attach command to exit
                await attachPromise;

                // After exiting we should see a client disconnected event
                await connectTestUtils.ensureConnectionEvent(attachTarget, ConnectionEventType.ClientDisconnect, testStartTime);
            }, 4 * 60 * 1000); // Use a longer timeout on attach tests because they essentially run 2 back-to-back connect tests

            it(`${testTarget.closeCaseId}: zli close - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Run normal connect test first but do not exit so the terminal and zli connect command remain running
                const shouldExit = false;
                const connectionId = await connectTestUtils.runShellConnectTest(testTarget, `connect test - ${systemTestUniqueId}`, shouldExit);

                // Call zli close which should cause the zli connect command to also exit
                const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());
                await callZli(['close', connectionId]);

                // cleanExit should be called twice. Once when the zli close
                // command exits and once when the zli connect command
                // exits.
                await testUtils.waitForExpect(
                    async () => expect(cleanExitSpy).toBeCalledTimes(2),
                    30 * 1000,
                    1 * 1000
                );

                // Expect our close event now
                await connectTestUtils.ensureConnectionEvent(connectTarget, ConnectionEventType.Closed, testStartTime);
            }, 2 * 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.badConnectCaseId}: zli connect bad user - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget, testTarget.awsRegion);

                // Call "zli connect"
                const connectPromise = callZli(['connect', `baduser@${connectTarget.name}`]);

                await expect(connectPromise).rejects.toThrow('cleanExit was called');
            }, 60 * 1000);
        });
    });
};