import { configService, logger, systemTestUniqueId } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { parseTargetString } from '../../../utils/utils';
import { TestUtils } from '../utils/test-utils';
import { TestTarget } from '../system-test.types';
import { ConnectTestUtils } from '../utils/connect-utils';
import { getTargetInfo } from '../utils/ssh-utils';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { EventsHttpService } from '../../../http-services/events/events.http-server';
import { waitForRestart } from '../utils/target-utils';

export const targetSuite = () => {
    describe('target suite', () => {

        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;

        beforeAll(() => {
        });

        afterEach(async () => {
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
        });

        // adding a success case for connecting to bzero targets via ssh using .environment
        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            // FIXME: add case id!!
            it(`${testTarget.sshCaseId}: restart target by name - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const { targetName, targetId } = await getTargetInfo(testTarget);
                await callZli(['target', 'restart', targetName]);

                const now = new Date(new Date().toUTCString());

                // first, check that the agent restarted
                console.log("Waiting for restart...");
                await waitForRestart(configService, logger, parseTargetString(targetName));

                console.log("restarted");

                const eventService = new EventsHttpService(configService, logger);
                const newChanges = await eventService.GetAgentStatusChangeEvents(targetId, now);
                expect(newChanges.length).toBe(3);
                expect(newChanges[0].statusChange).toBe("OnlineToOffline");
                expect(newChanges[1].statusChange).toBe("OfflineToRestarting");
                expect(newChanges[2].statusChange).toBe("RestartingToOnline");

                // TODO: oh and can check the restart Origin!

                // second, check that we can still connect to the agent
                await connectTestUtils.runShellConnectTest(testTarget, `target restart test - ${systemTestUniqueId}`, true);

            }, 120 * 1000);
        });
    });
}