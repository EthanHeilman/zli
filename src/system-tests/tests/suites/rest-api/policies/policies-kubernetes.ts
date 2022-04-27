import { SubjectType } from '../../../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { KubernetesPolicySummary } from '../../../../../../webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { PolicyType } from '../../../../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from '../../../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { PolicyHttpService } from '../../../../../http-services/policy/policy.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate } from '../../../system-test';
import { restApiPolicyDescriptionTemplate } from './policies';

export const kubernetesPolicySuite = () => {
    describe('Kubernetes Policies Suite', () => {
        const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'kubernetes');
        const currentUser: Subject = {
            id: configService.me().id,
            type: SubjectType.User
        };
        let policyService: PolicyHttpService;
        let kubernetesPolicy: KubernetesPolicySummary;
        let expectedPolicySummary: KubernetesPolicySummary;

        beforeAll(() => {
            policyService = new PolicyHttpService(configService, logger);
            expectedPolicySummary = {
                id: expect.any('string'),
                type: PolicyType.Kubernetes,
                groups: [],
                name: originalPolicyName,
                subjects: [
                    currentUser
                ],
                environments: [
                    {
                        id: systemTestEnvId
                    }
                ],
                clusters: null,
                clusterGroups: [],
                clusterUsers: [
                    {
                        name: 'test-user'
                    }
                ],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'kubernetes')
            };
        });

        afterAll(async () => {
            if (kubernetesPolicy) {
                await policyService.DeleteKubernetesPolicy(kubernetesPolicy.id);
            }
        }, 15 * 1000);

        test('2267: Create and get Kubernetes policy', async () => {
            kubernetesPolicy = await policyService.AddKubernetesPolicy({
                name: expectedPolicySummary.name,
                groups: expectedPolicySummary.groups,
                subjects: expectedPolicySummary.subjects,
                environments: expectedPolicySummary.environments,
                clusters: expectedPolicySummary.clusters,
                clusterGroups: expectedPolicySummary.clusterGroups,
                clusterUsers: expectedPolicySummary.clusterUsers,
                description: expectedPolicySummary.description
            });

            expectedPolicySummary.id = kubernetesPolicy.id;
            const retrievedPolicy = await policyService.GetKubernetesPolicy(kubernetesPolicy.id);
            // verify the policy that is retrieved from the back end matches the requested policy
            expect(retrievedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2268: Edit Kubernetes policy', async () => {
            const expectedPolicySummaryAfterEdit: KubernetesPolicySummary = Object.create(expectedPolicySummary);
            expectedPolicySummaryAfterEdit.description = 'modified description';
            expectedPolicySummaryAfterEdit.name = kubernetesPolicy.name += '-modified';

            const editedPolicy = await policyService.UpdateKubernetesPolicy(kubernetesPolicy.id, {
                name: expectedPolicySummaryAfterEdit.name,
                description: expectedPolicySummaryAfterEdit.description
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(expectedPolicySummaryAfterEdit).toMatchObject(editedPolicy);
        }, 15 * 1000);

        test('2269: Edit Kubernetes policy - should disallow adding cluster with an environment is already configured', async () => {
            let expectedError = undefined;
            try {
                await policyService.UpdateKubernetesPolicy(kubernetesPolicy.id, {
                    clusters: [
                        {
                            id: '5fa85f64-5717-4567-b3fc-2c963f66afa5' // not a real ID
                        }
                    ]
                });
            } catch(error) {
                expectedError = error;
            }

            expect(expectedError).toBeDefined();
        }, 15 * 1000);

        test('2270: Get all Kubernetes policies', async () => {
            const allPolicies = await policyService.ListKubernetesPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === kubernetesPolicy.id);
            // verify that the policy created in first test is in the list of all Kubernetes policies
            expect(foundPolicy).toBeDefined();
        }, 15 * 1000);

        test('2271: Delete Kubernetes policy', async () => {
            await policyService.DeleteKubernetesPolicy(kubernetesPolicy.id);
            const allPolicies = await policyService.ListKubernetesPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === kubernetesPolicy.id);
            // verify that the policy created in first test is no longer in the list of all Kubernetes policies
            expect(foundPolicy).toBeUndefined();

            // set to undefined so afterAll does not try to delete it again
            kubernetesPolicy = undefined;
        }, 15 * 1000);
    });
};