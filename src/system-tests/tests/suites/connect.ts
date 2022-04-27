import { MockSTDIN, stdin } from 'mock-stdin';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets, allTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanSSMTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from '../system-test.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { ConnectTestUtils } from '../utils/connect-utils';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';

export const connectSuite = () => {
    describe('connect suite', () => {
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let testUtils: TestUtils;
        let mockStdin: MockSTDIN;
        let connectTestUtils: ConnectTestUtils;

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
                targetUsers: [{ userName: 'ssm-user' }, { userName: bzeroTargetCustomUser }],
                verbs: [{ type: VerbType.Shell },]
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

            connectTestUtils = new ConnectTestUtils(mockStdin, connectionService, testUtils);
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
                const capturedResults = await connectTestUtils.runConnectTest(testTarget);
                connectionId = capturedResults.connectionId;
            }, 60 * 1000);

            it(`${testTarget.closeCaseId}: zli close - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget);
                const connectTarget = connectTestUtils.getConnectTarget(doTarget);

                // Call zli close
                await callZli(['close', connectionId]);

                // Expect our close event now
                expect(await testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.Closed));

                await connectTestUtils.runConnectTest(testTarget);
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