import { testIf } from 'system-tests/tests/utils/utils';
import { OrganizationControlsPolicySummary } from 'webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { configService, logger, systemTestPolicyTemplate, IN_PIPELINE } from 'system-tests/tests/system-test';
import { restApiPolicyDescriptionTemplate } from 'system-tests/tests/suites/rest-api/policies/policies';

export const organizationControlsPolicySuite = () => {
    describe('Organization Controls Policies Suite', () => {
        const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'organization-controls');
        let orgControlsPolicy: OrganizationControlsPolicySummary;
        let expectedPolicySummary: OrganizationControlsPolicySummary;
        let policyService: PolicyHttpService;

        // Adding an org policy should also add all subjects to the policy
        beforeAll(async () => {
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

            if(!IN_PIPELINE) {
                const allPolicies = await policyService.ListOrganizationControlPolicies();
                if(allPolicies.length == 1) {
                    orgControlsPolicy = allPolicies[0];
                } else {
                    // At this point, atleast one policy exists, so only errors for more than one
                    throw Error('More than one org policy exists');
                }

                // expect org policy in test runners to have mfaEnabled = true
                expectedPolicySummary.mfaEnabled = true;
            }
        });

        // this test will only be run in pipeline since we cannot create more than one org policy
        // and the test runner already has a default org policy with mfaEnabled set to true
        testIf(IN_PIPELINE, '2272: Create and get organization controls policy', async () => {
            // an organization controls policy with mfaEnabled set to true cannot be deleted
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

        // this test will only be run in pipeline since the test runner already has a default
        // org policy with mfaEnabled set to true which means it cannot be deleted
        testIf(IN_PIPELINE, '2275: Delete organization controls policy', async () => {
            await policyService.DeleteOrganizationControlsPolicy(orgControlsPolicy.id);
            const allPolicies = await policyService.ListOrganizationControlPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === orgControlsPolicy.id);
            // verify that the policy created in first test is no longer in the list of all organization controls policies
            expect(foundPolicy).toBeUndefined();
        }, 15 * 1000);
    });
};