import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { SessionRecordingPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { SessionRecordingHttpService } from '../../../http-services/session-recording/session-recording.http-services';
import { getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import {
    allTargets,
    configService,
    logger,
    loggerConfigService,
    systemTestEnvId,
    systemTestPolicyTemplate,
    systemTestUniqueId
} from '../system-test';
import { TestUtils } from '../utils/test-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { TestTarget } from '../system-test.types';
import { ConnectTestUtils } from '../utils/connect-utils';

export const sessionRecordingSuite = () => {
    describe('Session Recording Suite', () => {
        let testUtils: TestUtils;
        let sessionRecordingService: SessionRecordingHttpService;
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let targetConnectPolicy: TargetConnectPolicySummary;
        let sessionRecordingPolicy: SessionRecordingPolicySummary;
        let connectTestUtils: ConnectTestUtils;
        let testPassed: boolean = false;

        const allTestConnections: string[] = [];

        beforeAll(async () => {
            testUtils = new TestUtils(configService, logger, loggerConfigService);
            sessionRecordingService = new SessionRecordingHttpService(configService, logger);
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            targetConnectPolicy = await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
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
            sessionRecordingPolicy = await policyService.AddSessionRecordingPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'session-recording'),
                groups: [],
                subjects: [
                    currentUser
                ],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                recordInput: false
            });
        }, 15 * 1000);

        afterAll(async () => {
            const allDeleteSessionRecordingPromises: Promise<void>[] = [];
            allTestConnections.forEach(connectionId => allDeleteSessionRecordingPromises.push(sessionRecordingService.DeleteSessionRecording(connectionId)));
            try {
                // Using allSettled so that each of these clean-up requests is attempted even if one fails.
                await Promise.allSettled([
                    policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id),
                    policyService.DeleteSessionRecordingPolicy(sessionRecordingPolicy.id),
                    allDeleteSessionRecordingPromises
                ]);
            } catch (error) {
                // catching and ignoring errors here so that test running can continue
            }

            await connectTestUtils.cleanup();
        }, 15 * 1000);

        beforeEach(() => {
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
        });

        afterEach(async () => {
            await connectTestUtils.cleanup();

            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);
            testPassed = false;
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sessionRecordingCaseId}: Connect to target and verify session is recorded (${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)})`, async () => {
                const sessionRecordingTestMessage = `session recording test - ${systemTestUniqueId}`;
                const connectionId = await connectTestUtils.runShellConnectTest(testTarget, sessionRecordingTestMessage, true);

                // Get session recording and verify the echo'd message is in the asciicast data.
                const downloadedSessionRecording = await sessionRecordingService.GetSessionRecording(connectionId);
                const messageFound = downloadedSessionRecording.includes(sessionRecordingTestMessage);
                expect(messageFound).toEqual(true);

                testPassed = true;
            }, 2 * 60 * 1000);
        });

        test('3043: Get all session recordings', async () => {
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            // Using toBeGreaterThanOrEqual in case this suite is run in parallel with another one, which could
            // result in other recordings being created.
            expect(allRecordings.length).toBeGreaterThanOrEqual(allTestConnections.length);

            testPassed= true;
        }, 15 * 1000);

        test('3044: Try to delete each session recording - should not delete because connections are open', async () => {
            const deletePromises: Promise<void>[] = [];
            allTestConnections.forEach((connectionId: string) => deletePromises.push(sessionRecordingService.DeleteSessionRecording(connectionId)));
            const results = await Promise.allSettled(deletePromises);
            expect(results.every(result => result.status === 'rejected')).toBe(true);

            // Verify recordings still exist.
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            allTestConnections.forEach(connectionId => expect(allRecordings.find(recording => recording.connectionId === connectionId)).toBeDefined());

            testPassed= true;
        }, 30 * 1000);

        test('3045: Delete each session recording - should succeed because connections are closed', async () => {
            const deletePromises: Promise<void>[] = [];
            allTestConnections.forEach((connectionId: string) =>
                deletePromises.push(connectionService.CloseConnection(connectionId).then(_ => sessionRecordingService.DeleteSessionRecording(connectionId)))
            );

            const results = await Promise.allSettled(deletePromises);
            expect(results.every(results => results.status === 'fulfilled')).toBe(true);

            // Verify recordings no longer exist.
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            allTestConnections.forEach(connectionId => expect(allRecordings.find(recording => recording.connectionId === connectionId)).toBeUndefined());

            testPassed= true;
        }, 30 * 1000);
    });
};