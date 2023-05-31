import { SessionRecordingPolicySummary } from 'webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { configService, logger, systemTestPolicyTemplate } from 'system-tests/tests/system-test';
import { restApiPolicyDescriptionTemplate } from 'system-tests/tests/suites/rest-api/policies/policies';
import { callZli } from 'system-tests/tests/utils/zli-utils';

export const sessionRecordingPolicySuite = () => {
    describe('Session Recording Policies Suite', () => {
        let policyService: PolicyHttpService;
        let sessionRecordingPolicy: SessionRecordingPolicySummary;
        let expectedPolicySummary: SessionRecordingPolicySummary;

        beforeAll(async () => {
            policyService = await PolicyHttpService.init(configService, logger);

            const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'session-recording');
            const currentSubject: Subject = {
                id: configService.me().id,
                type: configService.me().type
            };
            expectedPolicySummary = {
                id: expect.any(String),
                type: PolicyType.SessionRecording,
                groups: [],
                name: originalPolicyName,
                subjects: [
                    currentSubject
                ],
                description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'session recording'),
                recordInput: false,
                timeExpires: null
            };
        });

        afterAll(async () => {
            if (sessionRecordingPolicy) {
                await policyService.DeleteSessionRecordingPolicy(sessionRecordingPolicy.id);
            }
        }, 15 * 1000);

        test('2281: Create and get session recording policy', async () => {
            const zliArgs = [
                'policy', 'create-recording',
                '-n', expectedPolicySummary.name,
                '-a', configService.me().email,
                '-r', 'false',
                '-d', expectedPolicySummary.description
            ];
            await callZli(zliArgs);

            const allPolicies = await policyService.ListSessionRecordingPolicies();
            sessionRecordingPolicy = allPolicies.find(p => p.name === expectedPolicySummary.name);
            expectedPolicySummary.id = sessionRecordingPolicy.id;

            // verify the policy that is retrieved from the back end matches the requested policy
            expect(sessionRecordingPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2282: Edit session recording policy', async () => {
            expectedPolicySummary.description = 'modified description';
            expectedPolicySummary.recordInput = true;
            expectedPolicySummary.name = sessionRecordingPolicy.name += '-modified';

            const editedSessionRecordingPolicy = await policyService.UpdateSessionRecordingPolicy(sessionRecordingPolicy.id, {
                name: expectedPolicySummary.name,
                description: expectedPolicySummary.description,
                recordInput: expectedPolicySummary.recordInput
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(editedSessionRecordingPolicy).toMatchObject(expectedPolicySummary);
        }, 15 * 1000);

        test('2283: Get all session recording policies', async () => {
            const allPolicies = await policyService.ListSessionRecordingPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === sessionRecordingPolicy.id);
            // verify that the policy created in first test is in the list of all session recording policies
            expect(foundPolicy).toBeDefined();
        }, 15 * 1000);

        test('2284: Delete session recording policy', async () => {
            await policyService.DeleteSessionRecordingPolicy(sessionRecordingPolicy.id);
            const allPolicies = await policyService.ListSessionRecordingPolicies();
            const foundPolicy = allPolicies.find(policy => policy.id === sessionRecordingPolicy.id);
            // verify that the policy created in first test is no longer in the list of all session recording policies
            expect(foundPolicy).toBeUndefined();

            // set to undefined so afterAll does not try to delete it again
            sessionRecordingPolicy = undefined;
        }, 15 * 1000);
    });
};