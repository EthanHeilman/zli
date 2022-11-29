import { OrganizationControlsPolicySummary } from '../../../../../../webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { PolicyType } from '../../../../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { PolicyHttpService } from '../../../../../http-services/policy/policy.http-services';
import { configService, logger, systemTestPolicyTemplate } from '../../../system-test';
import { restApiPolicyDescriptionTemplate } from './policies';

export const organizationControlsPolicySuite = () => {
    describe('Organization Controls Policies Suite', () => {
        const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'organization-controls');
        let orgControlsPolicy: OrganizationControlsPolicySummary;
        let expectedPolicySummary: OrganizationControlsPolicySummary;
        let policyService: PolicyHttpService;

        beforeAll(() => {
            policyService = new PolicyHttpService(configService, logger);
            expectedPolicySummary = {
                id: expect.any(String),
                type: PolicyType.OrganizationControls,
                groups: [],
                name: originalPolicyName,
                subjects: [],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'organization controls'),
                mfaEnabled: false,
                timeExpires: null
            };
        });

        afterAll(async () => {
            if (orgControlsPolicy) {
                await policyService.DeleteOrganizationControlsPolicy(orgControlsPolicy.id);
            }
        }, 15 * 1000);

        test('2272: Create and get organization controls policy', async () => {
            // An organization controls policy with mfaEnabled set to true cannot be deleted
            orgControlsPolicy = await policyService.AddOrganizationControlPolicy({
                name: expectedPolicySummary.name,
                groups: expectedPolicySummary.groups,
                subjects: expectedPolicySummary.subjects,
                description: expectedPolicySummary.description,
                mfaEnabled: false
            });

            expectedPolicySummary.id = orgControlsPolicy.id;
            const retrievedPolicy = await policyService.GetOrganizationControlsPolicy(orgControlsPolicy.id);
            // verify the policy that is retrieved from the back end matches the requested policy
            expect(retrievedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2273: Edit organization controls policy', async () => {
            expectedPolicySummary.description = 'modified description';
            expectedPolicySummary.name = orgControlsPolicy.name += '-modified';

            const editedPolicy = await policyService.UpdateOrganizationControlsPolicy(orgControlsPolicy.id, {
                name: expectedPolicySummary.name,
                description: expectedPolicySummary.description
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(editedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2274: Get all organization controls policies', async () => {
            const allPolicies = await policyService.ListOrganizationControlPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === orgControlsPolicy.id);
            // verify that the policy created in first test is in the list of all organization controls policies
            expect(foundPolicy).toBeDefined();
        }, 15 * 1000);

        test('2275: Delete organization controls policy', async () => {
            await policyService.DeleteOrganizationControlsPolicy(orgControlsPolicy.id);
            const allPolicies = await policyService.ListOrganizationControlPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === orgControlsPolicy.id);
            // verify that the policy created in first test is no longer in the list of all organization controls policies
            expect(foundPolicy).toBeUndefined();

            // set to undefined so afterAll does not try to delete it again
            orgControlsPolicy = undefined;
        }, 15 * 1000);
    });
};