import { allTargets, configService, GROUP_ID, GROUP_NAME, logger, OPA_SYNC_TIME, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId } from 'system-tests/tests/system-test';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { getDOImageName } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { sleepTimeout, TestUtils } from 'system-tests/tests/utils/test-utils';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from 'system-tests/tests/system-test.types';
import { cleanupTargetConnectPolicies } from 'system-tests/tests/system-test-cleanup';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { OrganizationHttpService } from 'http-services/organization/organization.http-services';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { ConnectTestUtils } from 'system-tests/tests/utils/connect-utils';

export const groupsSuite = () => {
    describe('Groups suite', () => {
        const targetConnectPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'group-connect');

        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let organizationService: OrganizationHttpService;
        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            organizationService = new OrganizationHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);

            const environment: Environment = {
                id: systemTestEnvId
            };

            // Call fetch endpoint to get the latest group information for the current user
            // We are fetching here as the python wrapper creates a dynamic group beforehand, but
            // our backend requires a new login (or this endpoint) to update group IDP membership
            await organizationService.FetchGroupsMembership(configService.me().id);

            // Then create our group based targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: targetConnectPolicyName,
                subjects: [],
                groups: [{
                    id: GROUP_ID,
                    name: GROUP_NAME
                }],
                description: `Target connect policy for groups based integration created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [{type: VerbType.Shell},]
            });

            await sleepTimeout(OPA_SYNC_TIME);
        }, 60 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(targetConnectPolicyName);
        }, 60 * 1000);

        // Called before each case
        beforeEach(() => {
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
        });

        // Called after each case
        afterEach(async () => {
            await connectTestUtils.cleanup();
        });

        // Attempt to make a connection to targets via our groups based policy
        allTargets.forEach(async (testTarget: TestTarget) => {
            test(`${testTarget.groupConnectCaseId}: zli group connect - ${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                await connectTestUtils.runShellConnectTest(testTarget, `groups test - ${systemTestUniqueId}`, true, false);
            }, 2 * 60 * 1000);
        });
    });
};