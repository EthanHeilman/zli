import { MockSTDIN, stdin } from 'mock-stdin';
import { allTargets, configService, GROUP_ID, GROUP_NAME, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId } from '../system-test';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from '../system-test.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { ConnectTestUtils } from '../utils/connect-utils';

export const groupsSuite = () => {
    describe('Groups suite', () => {
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let organizationService: OrganizationHttpService;
        let testUtils: TestUtils;
        let mockStdin: MockSTDIN;
        let connectTestUtils: ConnectTestUtils;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            organizationService = new OrganizationHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);

            const environment: Environment = {
                id: systemTestEnvId
            };

            // Call fetch endpoint to get the latest group information for the current user
            // We are fetching here as the python wrapper creates a dynamic group beforehand, but
            // our backend requires a new login (or this endpoint) to update group IDP membership
            await organizationService.FetchGroupsMembership(configService.me().id);

            // Then create our group based targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'group-connect'),
                subjects: [],
                groups: [{
                    id: GROUP_ID,
                    name: GROUP_NAME
                }],
                description: `Target connect policy for groups based integration created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: 'ssm-user' }, {userName: bzeroTargetCustomUser }],
                verbs: [{type: VerbType.Shell},]
            });
        }, 15 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'group-connect'));
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

        // Attempt to make a connection to our ssm targets via our groups based policy
        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.groupConnectCaseId}: zli group connect - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                await connectTestUtils.runConnectTest(testTarget);
            }, 60 * 1000);
        });
    });
};