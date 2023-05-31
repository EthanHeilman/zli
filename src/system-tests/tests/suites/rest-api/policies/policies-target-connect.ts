import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate } from 'system-tests/tests/system-test';
import { restApiPolicyDescriptionTemplate } from 'system-tests/tests/suites/rest-api/policies/policies';
import { callZli } from 'system-tests/tests/utils/zli-utils';

export const targetConnectPolicySuite = () => {
    describe('Target Connect Policies Suite', () => {
        let policyService: PolicyHttpService;
        let envHttpService: EnvironmentHttpService;
        let targetConnectPolicy: TargetConnectPolicySummary;
        let expectedPolicySummary: TargetConnectPolicySummary;

        beforeAll(async () => {
            policyService = await PolicyHttpService.init(configService, logger);
            envHttpService = await EnvironmentHttpService.init(configService, logger);

            const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect');
            const currentSubject: Subject = {
                id: configService.me().id,
                type: configService.me().type
            };
            expectedPolicySummary = {
                id: expect.any(String),
                type: PolicyType.TargetConnect,
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
                targetUsers: [
                    {
                        userName: 'test-user'
                    },
                    {
                        userName: '{username}'
                    },
                ],
                verbs: [
                    {
                        type: VerbType.Shell
                    }
                ],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'target connect'),
                timeExpires: null
            };
        });

        afterAll(async () => {
            if (targetConnectPolicy) {
                await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);
            }
        }, 15 * 1000);

        test('2285: Create and get target connect policy', async () => {
            // Need to get environment name for the zli call
            const environment = await envHttpService.GetEnvironment(systemTestEnvId);
            const zliArgs = [
                'policy', 'create-tconnect',
                '-n', expectedPolicySummary.name,
                '-a', configService.me().email,
                '-e', environment.name,
                '--targetUsers', 'test-user', '{username}',
                '-v', 'shell',
                '-d', expectedPolicySummary.description
            ];
            await callZli(zliArgs);

            const allPolicies = await policyService.ListTargetConnectPolicies();
            targetConnectPolicy = allPolicies.find(p => p.name === expectedPolicySummary.name);
            expectedPolicySummary.id = targetConnectPolicy.id;

            // verify the policy that is retrieved from the back end matches the requested policy
            expect(targetConnectPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2286: Edit target connect policy', async () => {
            expectedPolicySummary.description = 'modified description';
            expectedPolicySummary.name = targetConnectPolicy.name += '-modified';
            expectedPolicySummary.verbs.push({
                type: VerbType.FileTransfer
            });

            const editedPolicy = await policyService.UpdateTargetConnectPolicy(targetConnectPolicy.id, {
                name: expectedPolicySummary.name,
                description: expectedPolicySummary.description,
                verbs: expectedPolicySummary.verbs
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(editedPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2287: Edit target connect policy - should disallow adding target with an environment already configured', async () => {
            let expectedError = undefined;
            try {
                await policyService.UpdateTargetConnectPolicy(targetConnectPolicy.id, {
                    targets: [
                        {
                            id: '5fa85f64-5717-4567-b3fc-2c963f66afa5', // not a real ID
                            type: TargetType.Bzero
                        }
                    ]
                });
            } catch(error) {
                expectedError = error;
            }

            expect(expectedError).toBeDefined();
        }, 15 * 1000);

        test('2288: Get all target connect policies', async () => {
            const allPolicies = await policyService.ListTargetConnectPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === targetConnectPolicy.id);
            // verify that the policy created in first test is in the list of all target connect policies
            expect(foundPolicy).toBeDefined();
        }, 15 * 1000);

        test('2289: Delete target connect policy', async () => {
            await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);
            const allPolicies = await policyService.ListTargetConnectPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === targetConnectPolicy.id);
            // verify that the policy created in first test is no longer in the list of all target connect policies
            expect(foundPolicy).toBeUndefined();

            // set to undefined so afterAll does not try to delete it again
            targetConnectPolicy = undefined;
        }, 15 * 1000);
    });
};