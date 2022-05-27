import { SubjectType } from '../../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { TargetConnectPolicySummary } from '../../../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { Environment } from '../../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Subject } from '../../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { EventsHttpService } from '../../../../http-services/events/events.http-server';
import { PolicyHttpService } from '../../../../http-services/policy/policy.http-services';
import { UserHttpService } from '../../../../http-services/user/user.http-services';
import { configService, logger, loggerConfigService, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId } from '../../system-test';
import { ConnectTestUtils } from '../../utils/connect-utils';
import { TestUtils } from '../../utils/test-utils';

export const eventsRestApiSuite = () => {
    describe('Events REST API test suite', () => {
        let testUtils: TestUtils;
        let eventsService: EventsHttpService;
        let usersService: UserHttpService;
        let policyService: PolicyHttpService;
        let logStartTime: Date;
        let targetConnectPolicy: TargetConnectPolicySummary;

        beforeAll(async () => {
            testUtils = new TestUtils(configService, logger, loggerConfigService);
            eventsService = new EventsHttpService(configService, logger);
            usersService = new UserHttpService(configService, logger);
            policyService = new PolicyHttpService(configService, logger);

            // This is attempting to narrow down the window of events searched without adding a lot of complexity,
            // in order to increase the likelihood that the events are generated by the calls being made in the tests
            // as opposed to another test that may be running in parallel or that has already finished running.
            const mostRecentEvent = await eventsService.GetUserEvents(null, [configService.me().id], 1);
            logStartTime = mostRecentEvent[0]?.timestamp;
        });

        test('49706: A create policy request should create a user event', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            targetConnectPolicy = await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'event-rest'),
                subjects: [
                    currentUser
                ],
                groups: [],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                environments: [
                    environment
                ],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [
                    {
                        type: VerbType.Shell
                    }
                ]
            });

            const eventExists = await testUtils.EnsureUserEventExists('policymanagementservice:add', true, null, new Date(logStartTime));
            expect(eventExists).toBeTrue();
        }, 15 * 1000);

        test('49707: A modify policy request should create a user event', async () => {
            await policyService.UpdateTargetConnectPolicy(targetConnectPolicy.id, {
                description: targetConnectPolicy.description + '-modified'
            });
            const eventExists = await testUtils.EnsureUserEventExists('policymanagementservice:edit', true, null, new Date(logStartTime));
            expect(eventExists).toBeTrue();
        }, 15 * 1000);

        test('49708: A delete policy request should create a user event', async () => {
            await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);
            const eventExists = await testUtils.EnsureUserEventExists('policymanagementservice:delete', true, null, new Date(logStartTime));
            expect(eventExists).toBeTrue();
        }, 15 * 1000);

        test('49709: A GET request to the users/me endpoint should create a user event', async () => {
            await usersService.Me();
            const eventExists = await testUtils.EnsureUserEventExists('userserviceaction:me', true, null, new Date(logStartTime));
            expect(eventExists).toBeTrue();
        }, 15 * 1000);
    });
};