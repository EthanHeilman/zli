import { MockSTDIN, stdin } from 'mock-stdin';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import waitForExpect from 'wait-for-expect';
import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets, allTargets } from '../system-test';
import { getMockResultValue } from '../utils/jest-utils';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanSSMTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { TestTarget } from '../system-test.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { ConnectTestUtils } from '../utils/connect-utils';

export const connectSuite = () => {
    describe('connect suite', () => {
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;
        let mockStdin: MockSTDIN;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
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
                targetUsers: [{ userName: 'ssm-user' }, {userName: bzeroTargetCustomUser }],
                verbs: [{type: VerbType.Shell},]
            });
        }, 15 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));
        });

        // Called before each case
        beforeEach(() => {
            // Mocks must be cleared and restored prior to running each test
            // case. This is because Jest mocks and spies are global. We don't
            // want any captured mock state (invocations, spied args, etc.) and
            // mock implementations to leak through the different test runs.
            jest.restoreAllMocks();
            jest.clearAllMocks();
            mockStdin = stdin();

            connectTestUtils = new ConnectTestUtils(mockStdin);
        });

        // Called after each case
        afterEach(() => {
            if (mockStdin) {
                mockStdin.restore();
            }
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            // Keep track of our connection id so we can call the close endpoint
            let connectionId = '';
            it(`${testTarget.connectCaseId}: zli connect - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget);
                
                // Spy on result of the ConnectionHttpService.GetConnection
                // call. This spy is used to assert the correct regional
                // connection node was used to establish the websocket.
                const shellConnectionDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetConnection');

                // Also spy to get the connection Id
                const createConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateConnection');

                // Call "zli connect"
                const connectPromise = callZli(['connect', `${connectTarget.targetUser}@${connectTarget.name}`]);

                // Ensure that the created and connect event exists
                expect(await testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.ClientConnect));
                expect(await testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.Created));

                // Caution to future users of waitForExpect. This function
                // doesn't have a global timeout and instead retries for
                // Math.ceil(timeout / interval) times before failing. Further
                // the interval defaults to 10ms. So if each individual
                // expectation function runs much longer than the 10ms  default
                // interval this function is going to continue to run much
                // longer than the actual timeout. So make sure you set a
                // reasonable timeout and interval value compared to the overall
                // jest test timeout.
                // ref: https://github.com/TheBrainFamily/wait-for-expect/blob/6be6e2ed8e47fd5bc62ab2fc4bd39289c58f2f66/src/index.ts#L25
                await waitForExpect(
                    async () => {
                        // We should get some captured output (from the command
                        // prompt on login) before even sending any input
                        const capturedOutput = connectTarget.getCapturedOutput();
                        expect(capturedOutput.length).toBeGreaterThan(0);

                        // Assert the output spy receives the same input sent to stdIn.
                        // Keep sending input until the output spy says we've received what
                        // we sent (possibly sends command more than once).

                        const commandToSend = 'echo "hello world"';
                        await connectTarget.writeToStdIn(commandToSend);

                        // Check that the full "hello world" string exists as
                        // one of the strings in the captured output. This
                        // should be the result of executing the command in the
                        // terminal and not a result of typing the 'echo "hello
                        // world"' command as writeToStdIn will write this
                        // character by character, i.e captured output will
                        // contain something like:
                        // [... "e","c","h","o"," ","\"","h","e","l","l","o"," ","w","o","r","l","d","\"","\r\n","hello world\r\n", ... ]
                        const expectedRegex = [
                            expect.stringMatching(new RegExp('hello world'))
                        ];
                        expect(capturedOutput).toEqual(
                            expect.arrayContaining(expectedRegex),
                        );

                        // Check that 'echo "hello world"' command exists in our backend, its possible this will fail on first attempts if we go too fast
                        await testUtils.EnsureCommandLogExists(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, commandToSend);
                    },
                    1000 * 10,  // Timeout,
                    1000 * 1    // Interval
                );

                // Assert shell connection auth details returns expected
                // connection node aws region
                expect(shellConnectionDetailsSpy).toHaveBeenCalled();
                const gotShellConnectionDetails = await getMockResultValue(shellConnectionDetailsSpy.mock.results[0]);
                const shellConnectionAuthDetails = await connectionService.GetShellConnectionAuthDetails(gotShellConnectionDetails.id);
                expect(shellConnectionAuthDetails.region).toBe<string>(testTarget.awsRegion);

                // Send exit to the terminal so the zli connect handler will exit
                // and the test can complete. However we must override the mock
                // implementation of cleanExit to allow the zli connect command to
                // exit with code 1 without causing the test to fail.

                // TODO: This could be cleaned up in the future if we exit the zli
                // with exit code = 0 in this case. Currently there is no way for us
                // to distinguish between a normal closure (user types exit) and an
                // abnormal websocket closure
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => Promise.resolve());
                await connectTarget.writeToStdIn('exit');

                // Wait for connect shell to cleanup
                await connectPromise;

                // Set our connectionId
                expect(createConnectionSpy).toHaveBeenCalled();
                connectionId = await getMockResultValue(createConnectionSpy.mock.results[0]);

                // Ensure that the client disconnect event is here
                // Note, there is no close event since we do not close the connection, just disconnect from it
                expect(await testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.ClientDisconnect));
            }, 60 * 1000);

            it(`${testTarget.closeCaseId}: zli close - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                // TODO-Yuval: Fix this
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget);

                // Call zli close
                await callZli(['close', connectionId]);

                // Expect our close event now
                expect(await testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, 'SSM', ConnectionEventType.Closed));

            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.badConnectCaseId}: zli connect bad user - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget);

                // Call "zli connect"
                const connectPromise = callZli(['connect', `baduser@${connectTarget.name}`]);

                const expectedErrorMessage = 'Expected error';
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                    throw new Error(expectedErrorMessage);
                });

                await expect(connectPromise).rejects.toThrow(expectedErrorMessage);
            }, 60 * 1000);
        });
    });
};