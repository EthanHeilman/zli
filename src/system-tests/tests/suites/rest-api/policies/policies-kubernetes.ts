import { KubernetesPolicySummary } from 'webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate } from 'system-tests/tests/system-test';
import { restApiPolicyDescriptionTemplate } from 'system-tests/tests/suites/rest-api/policies/policies';
import { callZli } from 'system-tests/tests/utils/zli-utils';

export const kubernetesPolicySuite = () => {
    describe('Kubernetes Policies Suite', () => {
        let policyService: PolicyHttpService;
        let envHttpService: EnvironmentHttpService;
        let kubernetesPolicy: KubernetesPolicySummary;
        let expectedPolicySummary: KubernetesPolicySummary;

        beforeAll(() => {
            policyService = new PolicyHttpService(configService, logger);
            envHttpService = new EnvironmentHttpService(configService, logger);

            const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'kubernetes');
            const currentSubject: Subject = {
                id: configService.me().id,
                type: configService.me().type
            };
            expectedPolicySummary = {
                id: expect.any(String),
                type: PolicyType.Kubernetes,
                groups: [],
                name: originalPolicyName,
                subjects: [
                    currentSubject
                ],
                environments: [
                    {
                        id: systemTestEnvId
                    }
                ],
                clusters: [],
                clusterGroups: [
                    {
                        name: 'test-group'
                    }
                ],
                clusterUsers: [
                    {
                        name: 'test-user'
                    }
                ],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'kubernetes'),
                timeExpires: null
            };
        });

        afterAll(async () => {
            if (kubernetesPolicy) {
                await policyService.DeleteKubernetesPolicy(kubernetesPolicy.id);
            }
        }, 15 * 1000);

        test('2267: Create and get Kubernetes policy', async () => {
            // Need to get environment name for the zli call
            const environment = await envHttpService.GetEnvironment(systemTestEnvId);
            const zliArgs = [
                'policy', 'create-cluster',
                '-n', expectedPolicySummary.name,
                '-a', configService.me().email,
                '-e', environment.name,
                '--targetUsers', 'test-user',
                '--targetGroups', 'test-group',
                '-d', expectedPolicySummary.description
            ];
            await callZli(zliArgs);

            const allPolicies = await policyService.ListKubernetesPolicies();
            kubernetesPolicy = allPolicies.find(p => p.name === expectedPolicySummary.name);
            expectedPolicySummary.id = kubernetesPolicy.id;

            // verify the policy that is retrieved from the back end matches the requested policy
            expect(kubernetesPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2268: Edit Kubernetes policy', async () => {
            expectedPolicySummary.description = 'modified description';
            expectedPolicySummary.name = kubernetesPolicy.name += '-modified';

            const editedPolicy = await policyService.UpdateKubernetesPolicy(kubernetesPolicy.id, {
                name: expectedPolicySummary.name,
                description: expectedPolicySummary.description
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(editedPolicy).toMatchObject(expectedPolicySummary);
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