import { MockSTDIN, stdin } from 'mock-stdin';
import * as ShellUtils from '../../../utils/shell-utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import waitForExpect from 'wait-for-expect';
import { configService, datEndpoint, datSecret, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { getMockResultValue } from '../utils/jest-utils';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanSSMTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { VerbType } from '../../../../src/services/v1/policy-query/policy-query.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../../src/services/v1/policy/policy.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { TestTarget } from '../system-test.types';
import { ssmTestTargetsToRun } from '../targets-to-run';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { DynamicAccessConfigHttpService } from '../../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { RegisterDynamicAccessConfigRequest } from '../../../../webshell-common-ts/http/v2/target/dynamic/requests/register-dynamic-access-config.requests';

export const dynamicAccessSuite = () => {
    describe('dynamic access suite', () => {
        let policyService: PolicyHttpService;
        let dynamicAccessService: DynamicAccessConfigHttpService;
        let dynamicAccessId: string;
        let testUtils: TestUtils;

        let mockStdin: MockSTDIN;
        const targetUser = 'ssm-user';
        const datTargetName  = `system-test-dat-${systemTestUniqueId}`

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            dynamicAccessService = new DynamicAccessConfigHttpService(configService, logger);
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
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'dat-connect'),
                subjects: [currentUser],
                groups: [],
                description: `DAT connect policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }],
                verbs: [{type: VerbType.Shell},]
            });

            // Create our DAT target
            const response = await dynamicAccessService.CreateDynamicAccessConfigs({
                name: datTargetName,
                startWebhook: `${datEndpoint}/start`,
                stopWebhook: `${datEndpoint}/stop`,
                healthWebhook: `${datEndpoint}/health`,
                environmentId: systemTestEnvId,
                sharedSecret: datSecret
            })

            new Promise(resolve => setTimeout(resolve, 15000));
            dynamicAccessId = response.id;
        }, 15 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'dat-connect'));

            // Delete the DAT target
            await dynamicAccessService.DeleteDynamicAccessConfigs(dynamicAccessId);
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

        test('3090: Connect to DAT target', async () => {
            // Spy on result Bastion gives for shell auth details. This spy is
            // used at the end of the test to assert the correct regional
            // connection node was used to establish the websocket.
            const shellConnectionAuthDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails');

            // Spy on output pushed to stdout
            const capturedOutput: string[] = [];
            const outputSpy = jest.spyOn(ShellUtils, 'pushToStdOut')
                .mockImplementation((output) => {
                    capturedOutput.push(Buffer.from(output).toString('utf-8'));
                });

            // Call "zli connect"
            const connectPromise = callZli(['connect', `${targetUser}@${datTargetName}`]);

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

                    // Since we dont know the ID of the DAT target, we can just check the output
                    // to ensure the echo world command exists
                    // Check that "hello world" exists somewhere in the output
                    // (could be in "echo" command or in the output from running
                    // "echo")
                    const expectedRegex = [
                        expect.stringMatching(new RegExp('hello world'))
                    ];
                    expect(capturedOutput).toEqual(
                        expect.arrayContaining(expectedRegex),
                    );
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
            expect(gotShellConnectionAuthDetails.region).toBe<string>('us-east-1');
        }, 60 * 1000);
    });
};