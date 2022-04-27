import { MockSTDIN, stdin } from 'mock-stdin';
import waitForExpect from 'wait-for-expect';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { SessionRecordingPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { SessionRecordingHttpService } from '../../../http-services/session-recording/session-recording.http-services';
import * as ShellUtils from '../../../utils/shell-utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { DigitalOceanSSMTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import {
    configService,
    logger,
    loggerConfigService,
    systemTestEnvId,
    systemTestPolicyTemplate,
    systemTestUniqueId,
    testTargets
} from '../system-test';
import { ssmTestTargetsToRun } from '../targets-to-run';
import { TestUtils } from '../utils/test-utils';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../../http-services/space/space.http-services';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';
import { SpaceSummary } from '../../../../webshell-common-ts/http/v2/space/types/space-summary.types';
import { TestTarget } from '../system-test.types';

export const sessionRecordingSuite = () => {
    describe('Session Recording Suite', () => {
        let testUtils: TestUtils;
        let sessionRecordingService: SessionRecordingHttpService;
        let policyService: PolicyHttpService;
        let spaceService: SpaceHttpService;
        let connectionService: ConnectionHttpService;
        let cliSpace: SpaceSummary;
        let targetConnectPolicy: TargetConnectPolicySummary;
        let sessionRecordingPolicy: SessionRecordingPolicySummary;
        let mockStdin: MockSTDIN;

        const allTestConnections: string[] = [];
        const targetUser = 'ssm-user';

        beforeAll(async () => {
            testUtils = new TestUtils(configService, logger, loggerConfigService);
            sessionRecordingService = new SessionRecordingHttpService(configService, logger);
            policyService = new PolicyHttpService(configService, logger);
            spaceService = new SpaceHttpService(configService, logger);
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
                targetUsers: [
                    {
                        userName: targetUser
                    }
                ],
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
            cliSpace = await ShellUtils.getCliSpace(spaceService, logger);
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
        }, 15 * 1000);

        beforeEach(() => {
            jest.restoreAllMocks();
            jest.clearAllMocks();
            mockStdin = stdin();
        });

        afterEach(() => {
            if (mockStdin) {
                mockStdin.restore();
            }
        });

        ssmTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sessionRecordingCaseId}: Connect to target and verify session is recorded (${testTarget.awsRegion} - ${testTarget.installType} - ${getDOImageName(testTarget.dropletImage)})`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

                // Create a connection using REST API so that the ID can be known.
                const testConnectionId = await connectionService.CreateConnection(
                    TargetType.SsmTarget, doTarget.ssmTarget.id, cliSpace.id, targetUser);
                allTestConnections.push(testConnectionId);

                // Spy on output pushed to stdout
                const outputSpy = jest.spyOn(ShellUtils, 'pushToStdOut');
                const attachPromise = callZli(['attach', testConnectionId]);
                const message = 'session recording testing 123';
                const commandToSend = `echo "${message}"`;

                await waitForExpect(
                    async () => {
                        // Wait for there to be some output
                        expect(outputSpy).toHaveBeenCalled();

                        await testUtils.sendMockInput(commandToSend, mockStdin);

                        try {
                            await testUtils.EnsureCommandLogExists(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', commandToSend);
                        } catch (e: any) {
                            if (!e.toString().contains('Unable to find command:')) {
                                throw e;
                            }
                        }
                    },
                    1000 * 30
                );

                // Send exit to the terminal so the zli connect handler will exit
                // and the test can complete. However we must override the mock
                // implementation of cleanExit to allow the zli connect command to
                // exit with code 1 without causing the test to fail.
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => Promise.resolve());
                testUtils.sendMockInput('exit', mockStdin);

                // Wait for connect shell to cleanup
                await attachPromise;

                // Get session recording and verify the echo'd message is in the asciicast data.
                const downloadedSessionRecording = await sessionRecordingService.GetSessionRecording(testConnectionId);
                const messageFound = downloadedSessionRecording.includes(message);
                expect(messageFound).toEqual(true);
            }, 60 * 1000);
        });

        test('3043: Get all session recordings', async () => {
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            // Using toBeGreaterThanOrEqual in case this suite is run in parallel with another one, which could
            // result in other recordings being created.
            expect(allRecordings.length).toBeGreaterThanOrEqual(allTestConnections.length);
        }, 15 * 1000);

        test('3044: Try to delete each session recording - should not delete because connections are open', async () => {
            const deletePromises: Promise<void>[] = [];
            allTestConnections.forEach((connectionId: string) => deletePromises.push(sessionRecordingService.DeleteSessionRecording(connectionId)));
            const results = await Promise.allSettled(deletePromises);
            expect(results.every(result => result.status === 'rejected')).toBe(true);

            // Verify recordings still exist.
            const allRecordings = await sessionRecordingService.ListSessionRecordings();
            allTestConnections.forEach(connectionId => expect(allRecordings.find(recording => recording.connectionId === connectionId)).toBeDefined());
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
        }, 30 * 1000);
    });
};