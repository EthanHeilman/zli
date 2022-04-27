import { MockSTDIN, stdin } from 'mock-stdin';
import * as ShellUtils from '../../../utils/shell-utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import waitForExpect from 'wait-for-expect';
import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { getMockResultValue } from '../utils/jest-utils';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanSSMTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { TestTarget } from '../system-test.types';
import { ssmTestTargetsToRun } from '../targets-to-run';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';

export const connectSuite = () => {
    describe('connect suite', () => {
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;

        let mockStdin: MockSTDIN;
        const targetUser = 'ssm-user';

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
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
                targetUsers: [{ userName: targetUser }],
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
        });

        // Called after each case
        afterEach(() => {
            if (mockStdin) {
                mockStdin.restore();
            }
        });

        ssmTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            // Keep track of our connection id so we can call the close endpoint
            let connectionId = '';

            it(`${testTarget.connectCaseId}: zli connect - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

                // Spy on result Bastion gives for shell auth details. This spy is
                // used at the end of the test to assert the correct regional
                // connection node was used to establish the websocket.
                const shellConnectionAuthDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails');
                // Also spy to get the connection Id
                const createConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateConnection');

                // Spy on output pushed to stdout
                const capturedOutput: string[] = [];
                const outputSpy = jest.spyOn(ShellUtils, 'pushToStdOut')
                    .mockImplementation((output) => {
                        capturedOutput.push(Buffer.from(output).toString('utf-8'));
                    });

                // Call "zli connect"
                const connectPromise = callZli(['connect', `${targetUser}@${doTarget.ssmTarget.name}`]);

                // Ensure that the created and connect event exists
                expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.ClientConnect));
                expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.Created));

                // Assert the output spy receives the same input sent to mock stdIn.
                // Keep sending input until the output spy says we've received what
                // we sent (possibly sends command more than once).

                const commandToSend = 'echo "hello world"';
                await waitForExpect(
                    async () => {
                        // Wait for there to be some output
                        expect(outputSpy).toHaveBeenCalled();

                        // There is still a chance that pty is not ready, or
                        // blockInput is still true (no shell start received).
                        // Therefore, we might send this command more than once.
                        // Also, most likely there is some network delay to receive
                        // output.
                        await testUtils.sendMockInput(commandToSend, mockStdin);

                        // Check that "hello world" command exists in out backend, its possible this will fail if we go to fast
                        try {
                            await testUtils.EnsureCommandLogExists(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', commandToSend);
                        } catch (e: any) {
                            if (!e.toString().contains('Unable to find command:')) {
                                throw e;
                            }
                        }
                    },
                    1000 * 30,  // Timeout
                );

                // Send exit to the terminal so the zli connect handler will exit
                // and the test can complete. However we must override the mock
                // implementation of cleanExit to allow the zli connect command to
                // exit with code 1 without causing the test to fail.

                // TODO: This could be cleaned up in the future if we exit the zli
                // with exit code = 0 in this case. Currently there is no way for us
                // to distinguish between a normal closure (user types exit) and an
                // abnormal websocket closure
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => Promise.resolve());
                testUtils.sendMockInput('exit', mockStdin);

                // Wait for connect shell to cleanup
                await connectPromise;

                // Assert shell connection auth details returns expected connection
                // node region
                expect(shellConnectionAuthDetailsSpy).toHaveBeenCalled();
                const gotShellConnectionAuthDetails = await getMockResultValue(shellConnectionAuthDetailsSpy.mock.results[0]);
                expect(gotShellConnectionAuthDetails.region).toBe<string>(testTarget.awsRegion);

                // Set our connectionId
                expect(createConnectionSpy).toHaveBeenCalled();
                connectionId = await getMockResultValue(createConnectionSpy.mock.results[0]);

                // Ensure that the client disconnect event is here
                // Note, there is no close event since we do not close the connection, just disconnect from it
                expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.ClientDisconnect));
            }, 60 * 1000);

            it(`${testTarget.closeCaseId}: zli close - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

                // Call zli close
                await callZli(['close', connectionId]);

                // Expect our close event now
                expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.Closed));

            }, 60 * 1000);
        });



        ssmTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.badConnectCaseId}: zli connect bad user - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

                // Spy on result Bastion gives for shell auth details. This spy is
                // used at the end of the test to ensure it has not been called
                const shellConnectionAuthDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails');

                // Call "zli connect"
                const expectedErrorMessage = 'Expected error';
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                    throw new Error(expectedErrorMessage);
                });
                const connectPromise = callZli(['connect', `baduser@${doTarget.ssmTarget.name}`]);

                await expect(connectPromise).rejects.toThrow(expectedErrorMessage);

                // Assert shell connection auth details has not been called
                expect(shellConnectionAuthDetailsSpy).not.toHaveBeenCalled();
            }, 60 * 1000);
        });
    });
};