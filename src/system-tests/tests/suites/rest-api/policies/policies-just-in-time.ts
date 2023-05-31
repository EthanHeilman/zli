import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { JustInTimePolicySummary } from 'webshell-common-ts/http/v2/policy/just-in-time/types/just-in-time-policy-summary.types';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate, systemTestUser } from 'system-tests/tests/system-test';
import { restApiPolicyDescriptionTemplate } from 'system-tests/tests/suites/rest-api/policies/policies';

export const justInTimePolicySuite = () => {
    describe('Just In Time Policies Suite', () => {
        let policyService: PolicyHttpService;
        let jitPolicy: JustInTimePolicySummary;
        let jitChildPolicy: TargetConnectPolicySummary;
        let expectedPolicySummary: JustInTimePolicySummary;

        beforeAll(async () => {
            policyService = await PolicyHttpService.init(configService, logger);

            // Create a child policy we can use in the JIT policy
            const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'jit');

            // using systemTestUser as subject because SAs are not allowed as
            // subjects in JIT policies
            const systemTestUserSubject: Subject = {
                id: systemTestUser.id,
                type: SubjectType.User
            };
            jitChildPolicy = await policyService.AddTargetConnectPolicy({
                groups: [],
                name: 'jit-child-target-connect',
                subjects: [
                    systemTestUserSubject
                ],
                environments: [
                    {
                        id: systemTestEnvId
                    }
                ],
                targetUsers: [
                    {
                        userName: 'test-user'
                    }
                ],
                verbs: [
                    {
                        type: VerbType.Shell
                    }
                ],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'target connect')
            });

            expectedPolicySummary = {
                id: expect.any(String),
                type: PolicyType.JustInTime,
                groups: [],
                name: originalPolicyName,
                subjects: [
                    systemTestUserSubject
                ],
                childPolicies: [
                    {
                        id: jitChildPolicy.id,
                        name: jitChildPolicy.name,
                        type: jitChildPolicy.type
                    }
                ],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'target connect'),
                automaticallyApproved: false,
                duration: 60,
                timeExpires: null
            };
        });

        afterAll(async () => {
            // Delete jit child policies
            await policyService.DeleteTargetConnectPolicy(jitChildPolicy.id);

            // Delete the jit policy if it exists (delete test may have failed)
            if (jitPolicy) {
                await policyService.DeleteJustInTimePolicy(jitPolicy.id);
            }
        }, 15 * 1000);

        test('158841: Create just in time policy', async () => {
            jitPolicy = await policyService.AddJustInTimePolicy({
                name: expectedPolicySummary.name,
                groups: expectedPolicySummary.groups,
                subjects: expectedPolicySummary.subjects,
                description: expectedPolicySummary.description,
                childPolicies: expectedPolicySummary.childPolicies.map(p => p.id),
                automaticallyApproved: expectedPolicySummary.automaticallyApproved,
                duration: expectedPolicySummary.duration
            });

            expectedPolicySummary.id = jitPolicy.id;
            const retrievedPolicy = await policyService.GetJustInTimePolicy(jitPolicy.id);

            logger.info(JSON.stringify(retrievedPolicy));
            // verify the policy that is retrieved from the back end matches the requested policy
            expect(retrievedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('158842: Edit just in time policy', async () => {
            expectedPolicySummary.description = 'modified description';
            expectedPolicySummary.name = jitPolicy.name += '-modified';
            // also update the list of child policies to make sure that is being updated
            expectedPolicySummary.childPolicies = [];

            const editedPolicy = await policyService.UpdateJustInTimePolicy(jitPolicy.id, {
                name: expectedPolicySummary.name,
                description: expectedPolicySummary.description,
                childPolicies: expectedPolicySummary.childPolicies.map(p => p.id)
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(editedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('158843: Get all just in time policies', async () => {
            const allPolicies = await policyService.ListJustInTimePolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === jitPolicy.id);
            // verify that the policy created in first test is in the list of all target connect policies
            expect(foundPolicy).toBeDefined();
        }, 15 * 1000);

        test('158844: Delete just in time policy', async () => {
            await policyService.DeleteJustInTimePolicy(jitPolicy.id);
            const allPolicies = await policyService.ListTargetConnectPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === jitPolicy.id);
            // verify that the policy created in first test is no longer in the list of all target connect policies
            expect(foundPolicy).toBeUndefined();

            // set to undefined so afterAll does not try to delete it again
            jitPolicy = undefined;
        }, 15 * 1000);
    });
};