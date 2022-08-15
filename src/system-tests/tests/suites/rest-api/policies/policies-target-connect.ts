import { SubjectType } from '../../../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { TargetConnectPolicySummary } from '../../../../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { PolicyType } from '../../../../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from '../../../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { TargetType } from '../../../../../../webshell-common-ts/http/v2/target/types/target.types';
import { PolicyHttpService } from '../../../../../http-services/policy/policy.http-services';
import { EnvironmentHttpService } from '../../../../../http-services/environment/environment.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate } from '../../../system-test';
import { restApiPolicyDescriptionTemplate } from './policies';
import { callZli } from '../../../utils/zli-utils';

export const targetConnectPolicySuite = () => {
    describe('Target Connect Policies Suite', () => {
        const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect');
        const currentUser: Subject = {
            id: configService.me().id,
            type: SubjectType.User
        };
        let policyService: PolicyHttpService;
        let envHttpService: EnvironmentHttpService;
        let targetConnectPolicy: TargetConnectPolicySummary;
        let expectedPolicySummary: TargetConnectPolicySummary;

        beforeAll(() => {
            policyService = new PolicyHttpService(configService, logger);
            envHttpService = new EnvironmentHttpService(configService, logger);
            expectedPolicySummary = {
                id: expect.any('string'),
                type: PolicyType.TargetConnect,
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
                '-u', configService.me().email,
                '-e', environment.name,
                '--targetUsers', 'test-user',
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
            const expectedPolicySummaryAfterEdit: TargetConnectPolicySummary = Object.create(expectedPolicySummary);
            expectedPolicySummaryAfterEdit.description = 'modified description';
            expectedPolicySummaryAfterEdit.name = targetConnectPolicy.name += '-modified';
            expectedPolicySummaryAfterEdit.verbs.push({
                type: VerbType.FileTransfer
            });

            const editedPolicy = await policyService.UpdateTargetConnectPolicy(targetConnectPolicy.id, {
                name: expectedPolicySummaryAfterEdit.name,
                description: expectedPolicySummaryAfterEdit.description,
                verbs: expectedPolicySummaryAfterEdit.verbs
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(expectedPolicySummaryAfterEdit).toMatchObject(editedPolicy);
        }, 15 * 1000);

        test('2287: Edit target connect policy - should disallow adding target with an environment is already configured', async () => {
            let expectedError = undefined;
            try {
                await policyService.UpdateTargetConnectPolicy(targetConnectPolicy.id, {
                    targets: [
                        {
                            id: '5fa85f64-5717-4567-b3fc-2c963f66afa5', // not a real ID
                            type: TargetType.SsmTarget
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