import { ProxyPolicySummary } from 'webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate } from 'system-tests/tests/system-test';
import { restApiPolicyDescriptionTemplate } from 'system-tests/tests/suites/rest-api/policies/policies';
import { callZli } from 'system-tests/tests/utils/zli-utils';

export const proxyPolicySuite = () => {
    describe('Proxy Policies Suite', () => {
        let policyService: PolicyHttpService;
        let envHttpService: EnvironmentHttpService;
        let proxyPolicy: ProxyPolicySummary;
        let expectedPolicySummary: ProxyPolicySummary;
        let proxyPolicyTargetUsers: ProxyPolicySummary;
        let expectedPolicyTargetUsersSummary: ProxyPolicySummary;

        beforeAll(async () => {
            policyService = await PolicyHttpService.init(configService, logger);
            envHttpService = await EnvironmentHttpService.init(configService, logger);

            const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy');
            const proxyPolicyTargetUsersName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy-target-users');

            const currentSubject: Subject = {
                id: configService.me().id,
                type: configService.me().type
            };
            expectedPolicySummary = {
                id: expect.any(String),
                type: PolicyType.Proxy,
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
                targets: [],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'proxy'),
                timeExpires: null
            };

            expectedPolicyTargetUsersSummary = {
                id: expect.any(String),
                type: PolicyType.Proxy,
                groups: [],
                name: proxyPolicyTargetUsersName,
                subjects: [
                    currentSubject
                ],
                environments: [
                    {
                        id: systemTestEnvId
                    }
                ],
                targets: [],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'proxy'),
                timeExpires: null,
                targetUsers: [{ userName: 'testuser1' }, { userName: 'testuser2' }]
            };
        });

        afterAll(async () => {
            [proxyPolicy, proxyPolicyTargetUsers].forEach(async (policy) => {
                if (policy) {
                    await policyService.DeleteProxyPolicy(policy.id);
                }
            });
        }, 15 * 1000);

        test('2276: Create and get proxy policy', async () => {
            // Need to get environment name for the zli call
            const environment = await envHttpService.GetEnvironment(systemTestEnvId);
            const zliArgs = [
                'policy', 'create-proxy',
                '-n', expectedPolicySummary.name,
                '-a', configService.me().email,
                '-e', environment.name,
                '-d', expectedPolicySummary.description
            ];
            await callZli(zliArgs);

            const allPolicies = await policyService.ListProxyPolicies();
            proxyPolicy = allPolicies.find(p => p.name === expectedPolicySummary.name);
            expectedPolicySummary.id = proxyPolicy.id;

            // verify the policy that is retrieved from the back end matches the requested policy
            expect(proxyPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('742489: Create and get proxy policy with target users', async () => {
            // Need to get environment name for the zli call
            const environment = await envHttpService.GetEnvironment(systemTestEnvId);
            const zliArgs = [
                'policy', 'create-proxy',
                '-n', expectedPolicyTargetUsersSummary.name,
                '-a', configService.me().email,
                '-e', environment.name,
                '-d', expectedPolicyTargetUsersSummary.description,
                '--targetUsers', 'testuser1', 'testuser2',
            ];
            await callZli(zliArgs);

            const allPolicies = await policyService.ListProxyPolicies();
            proxyPolicyTargetUsers = allPolicies.find(p => p.name === expectedPolicyTargetUsersSummary.name);
            expectedPolicyTargetUsersSummary.id = proxyPolicyTargetUsers.id;

            // verify the policy that is retrieved from the back end matches the requested policy
            expect(proxyPolicyTargetUsers).toMatchObject(expectedPolicyTargetUsersSummary);
        }, 15 * 1000);

        test('2277: Edit proxy policy', async () => {
            expectedPolicySummary.description = 'modified description';
            expectedPolicySummary.name = proxyPolicy.name += '-modified';

            const editedPolicy = await policyService.UpdateProxyPolicy(proxyPolicy.id, {
                name: expectedPolicySummary.name,
                description: expectedPolicySummary.description
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(editedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2278: Edit proxy policy - should disallow adding target with an environment is already configured', async () => {
            let expectedError = undefined;
            try {
                await policyService.UpdateProxyPolicy(proxyPolicy.id, {
                    targets: [
                        {
                            id: '5fa85f64-5717-4567-b3fc-2c963f66afa5', // not a real ID
                            type: TargetType.Web
                        }
                    ]
                });
            } catch(error) {
                expectedError = error;
            }

            expect(expectedError).toBeDefined();
        }, 15 * 1000);

        test('2279: Get all proxy policies', async () => {
            const allPolicies = await policyService.ListProxyPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === proxyPolicy.id);
            // verify that the policy created in first test is in the list of all proxy policies
            expect(foundPolicy).toBeDefined();
        }, 15 * 1000);

        test('2280: Delete proxy policy', async () => {
            await policyService.DeleteProxyPolicy(proxyPolicy.id);
            const allPolicies = await policyService.ListProxyPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === proxyPolicy.id);
            // verify that the policy created in first test is no longer in the list of all proxy policies
            expect(foundPolicy).toBeUndefined();

            // set to undefined so afterAll does not try to delete it again
            proxyPolicy = undefined;
        }, 15 * 1000);
    });
};