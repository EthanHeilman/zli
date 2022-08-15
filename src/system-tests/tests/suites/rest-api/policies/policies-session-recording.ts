import { SubjectType } from '../../../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { SessionRecordingPolicySummary } from '../../../../../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { PolicyType } from '../../../../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { Subject } from '../../../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { PolicyHttpService } from '../../../../../http-services/policy/policy.http-services';
import { configService, logger, systemTestPolicyTemplate } from '../../../system-test';
import { restApiPolicyDescriptionTemplate } from './policies';
import { callZli } from '../../../utils/zli-utils';

export const sessionRecordingPolicySuite = () => {
    describe('Session Recording Policies Suite', () => {
        const originalPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'session-recording');
        const currentUser: Subject = {
            id: configService.me().id,
            type: SubjectType.User
        };
        const expectedPolicySummary: SessionRecordingPolicySummary = {
            id: expect.any('string'),
            type: PolicyType.SessionRecording,
            groups: [],
            name: originalPolicyName,
            subjects: [
                currentUser
            ],
            description: restApiPolicyDescriptionTemplate.replace('$POLICY_TYPE', 'session recording'),
            recordInput: false
        };
        let policyService: PolicyHttpService;
        let sessionRecordingPolicy: SessionRecordingPolicySummary;

        beforeAll(() => {
            policyService = new PolicyHttpService(configService, logger);
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
                '-u', configService.me().email,
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
            const expectedPolicySummaryAfterEdit: SessionRecordingPolicySummary = Object.create(expectedPolicySummary);
            expectedPolicySummaryAfterEdit.description = 'modified description';
            expectedPolicySummaryAfterEdit.recordInput = true;
            expectedPolicySummaryAfterEdit.name = sessionRecordingPolicy.name += '-modified';

            const editedSessionRecordingPolicy = await policyService.UpdateSessionRecordingPolicy(sessionRecordingPolicy.id, {
                name: expectedPolicySummaryAfterEdit.name,
                description: expectedPolicySummaryAfterEdit.description,
                recordInput: expectedPolicySummaryAfterEdit.recordInput
            });

            // verify the policy that is retrieved from the back end matches the modified policy
            expect(expectedPolicySummaryAfterEdit).toMatchObject(editedSessionRecordingPolicy);
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