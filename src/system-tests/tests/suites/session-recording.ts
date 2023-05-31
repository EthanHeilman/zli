import { SessionRecordingPolicySummary } from 'webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { SessionRecordingHttpService } from 'http-services/session-recording/session-recording.http-services';
import { getDOImageName } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import {
    OPA_SYNC_TIME,
    configService,
    logger,
    systemTestEnvId,
    systemTestPolicyTemplate,
    systemTestUniqueId
} from 'system-tests/tests/system-test';
import { TestUtils, sleepTimeout } from 'system-tests/tests/utils/test-utils';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { TestTarget } from 'system-tests/tests/system-test.types';
import { ConnectTestResult, ConnectTestUtils } from 'system-tests/tests/utils/connect-utils';
import { checkAllSettledPromise, checkAllSettledPromiseRejected } from 'system-tests/tests/utils/utils';
import * as CleanExitHandler from 'handlers/clean-exit.handler';
import { bzeroTestTargetsToRun } from 'system-tests/tests/targets-to-run';

export const sessionRecordingSuite = () => {
    describe('Session Recording Suite', () => {
        let testUtils: TestUtils;
        let sessionRecordingService: SessionRecordingHttpService;
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let targetConnectPolicy: TargetConnectPolicySummary;
        let sessionRecordingPolicy: SessionRecordingPolicySummary;
        let connectTestUtils: ConnectTestUtils;

        const allTestConnectionResults: ConnectTestResult[] = [];

        beforeAll(async () => {
            testUtils = new TestUtils(configService, logger);
            sessionRecordingService = new SessionRecordingHttpService(configService, logger);
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);

            const me = await configService.me();
            const subjectEmail: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            targetConnectPolicy = await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [
                    subjectEmail
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
                    subjectEmail
                ],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                recordInput: false
            });

            await sleepTimeout(OPA_SYNC_TIME);
        }, 60 * 1000);

        afterAll(async () => {
            const allDeleteSessionRecordingPromises = allTestConnectionResults.map(connectTestResult => sessionRecordingService.DeleteSessionRecording(connectTestResult.connectionId));
            // Using allSettled so that each of these clean-up requests is attempted even if one fails.
            await checkAllSettledPromise(Promise.allSettled([
                policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id),
                policyService.DeleteSessionRecordingPolicy(sessionRecordingPolicy.id),
                allDeleteSessionRecordingPromises
            ]));
            await connectTestUtils.cleanup();
        }, 60 * 1000);

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sessionRecordingCaseId}: Connect to target and verify session is recorded (${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)})`, async () => {
                const sessionRecordingTestMessage = `session recording test - ${systemTestUniqueId}`;
                // Dont close the connection so we can test deleting session
                // recordings before connections are closed
                const exit = false;
                const connectTestResult = await connectTestUtils.runShellConnectTest(testTarget, sessionRecordingTestMessage, exit, false);
                allTestConnectionResults.push(connectTestResult);

                // Get session recording and verify the echo'd message is in the asciicast data.
                const downloadedSessionRecording = await sessionRecordingService.GetSessionRecording(connectTestResult.connectionId);
                const messageFound = downloadedSessionRecording.includes(sessionRecordingTestMessage);
                expect(messageFound).toEqual(true);
            }, 3 * 60 * 1000);
        });

        test('3043: Get all session recordings', async () => {
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            // Using toBeGreaterThanOrEqual in case this suite is run in parallel with another one, which could
            // result in other recordings being created.
            expect(allRecordings.length).toBeGreaterThanOrEqual(allTestConnectionResults.length);
        }, 15 * 1000);

        test('3044: Try to delete each session recording - should not delete because connections are open', async () => {
            await checkAllSettledPromiseRejected(Promise.allSettled(
                allTestConnectionResults.map((connectionTestResult) => sessionRecordingService.DeleteSessionRecording(connectionTestResult.connectionId))
            ));

            // Verify recordings still exist.
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            expect(allRecordings.map(s => s.connectionId)).toEqual(expect.arrayContaining(allTestConnectionResults.map(connectionTestResult => connectionTestResult.connectionId)));
        }, 30 * 1000);

        test('3045: Delete each session recording - should succeed because connections are closed', async () => {
            const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());
            await checkAllSettledPromise(Promise.allSettled(
                allTestConnectionResults.map(async (connectionTestResult) => {
                    await connectionService.CloseConnection(connectionTestResult.connectionId);
                    await sessionRecordingService.DeleteSessionRecording(connectionTestResult.connectionId);
                    await connectionTestResult.zliConnectPromise;
                })
            ));

            // cleanExit should be called for each connection we close
            expect(cleanExitSpy).toBeCalledTimes(allTestConnectionResults.length);

            // Verify recordings no longer exist.
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            allTestConnectionResults.forEach(connectionRestResult => expect(allRecordings.find(recording => recording.connectionId === connectionRestResult.connectionId)).toBeUndefined());
        }, 30 * 1000);
    });
};