import { SubjectType } from '../../../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { ProxyPolicySummary } from '../../../../../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { PolicyType } from '../../../../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from '../../../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { TargetType } from '../../../../../../webshell-common-ts/http/v2/target/types/target.types';
import { PolicyHttpService } from '../../../../../http-services/policy/policy.http-services';
import { EnvironmentHttpService } from '../../../../../http-services/environment/environment.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate } from '../../../system-test';
import { restApiPolicyDescriptionTemplate } from './policies';
import { callZli } from '../../../utils/zli-utils';

export const proxyPolicySuite = () => {
    describe('Proxy Policies Suite', () => {
        const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy');
        const currentUser: Subject = {
            id: configService.me().id,
            type: SubjectType.User
        };
        let policyService: PolicyHttpService;
        let envHttpService: EnvironmentHttpService;
        let proxyPolicy: ProxyPolicySummary;
        let expectedPolicySummary: ProxyPolicySummary;

        beforeAll(() => {
            policyService = new PolicyHttpService(configService, logger);
            envHttpService = new EnvironmentHttpService(configService, logger);
            expectedPolicySummary = {
                id: expect.any('string'),
                type: PolicyType.Proxy,
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
                targets: null,
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'proxy')
            };
        });

        afterAll(async () => {
            if (proxyPolicy) {
                await policyService.DeleteProxyPolicy(proxyPolicy.id);
            }
        }, 15 * 1000);

        test('2276: Create and get proxy policy', async () => {
            // Need to get environment name for the zli call
            const environment = await envHttpService.GetEnvironment(systemTestEnvId);
            const zliArgs = [
                'policy', 'create-proxy',
                '-n', expectedPolicySummary.name,
                '-u', configService.me().email,
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

        test('2277: Edit proxy policy', async () => {
            const expectedPolicySummaryAfterEdit: ProxyPolicySummary = Object.create(expectedPolicySummary);
            expectedPolicySummaryAfterEdit.description = 'modified description';
            expectedPolicySummaryAfterEdit.name = proxyPolicy.name += '-modified';

            const editedPolicy = await policyService.UpdateProxyPolicy(proxyPolicy.id, {
                name: expectedPolicySummaryAfterEdit.name,
                description: expectedPolicySummaryAfterEdit.description
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(expectedPolicySummaryAfterEdit).toMatchObject(editedPolicy);
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