import path from 'path';
import fs from 'fs';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { promisify } from 'util';
import { exec } from 'child_process';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { allTargets, configService, logger, systemTestEnvId, loggerConfigService, systemTestPolicyTemplate, systemTestUniqueId } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { removeIfExists } from '../../../utils/utils';
import { TestUtils } from '../utils/test-utils';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from '../system-test.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { ConnectTestUtils } from '../utils/connect-utils';
import { ssmUser, getTargetInfo, expectIncludeStmtInConfig, expectTargetsInBzConfig } from '../utils/ssh-utils';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { EventsHttpService } from '../../../http-services/events/events.http-server';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';
import { listTargets } from '../../../services/list-targets/list-targets.service';
import { TargetStatus } from '../../../../webshell-common-ts/http/v2/target/types/targetStatus.types';

export const sshSuite = () => {
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

                let goneOffline = false;
                let backOnline = false;

                const now = new Date(new Date().toUTCString());

                // first, check that the agent restarted
                // TODO: factor this out
                while (!goneOffline) {
                    const targets = await listTargets(configService, logger, [TargetType.Bzero]);
                    const myTarget = targets.filter(target => target.name === targetName);
                    if (myTarget.length !== 1) {
                        throw new Error(`Expected 1 target but got ${myTarget.length}`);
                    } else {
                        goneOffline = myTarget[0].status === TargetStatus.Offline;
                    }
                }

                while (!backOnline) {
                    const targets = await listTargets(configService, logger, [TargetType.Bzero]);
                    const myTarget = targets.filter(target => target.name === targetName);
                    if (myTarget.length !== 1) {
                        throw new Error(`Expected 1 target but got ${myTarget.length}`);
                    } else {
                        backOnline = myTarget[0].status === TargetStatus.Online;
                    }
                }

                const eventService = new EventsHttpService(configService, logger);
                const agentStatusChanges = await eventService.GetAgentStatusChangeEvents(targetId);
                const newChanges = agentStatusChanges.filter(e => new Date(e.timeStamp).getTime() > now.getTime())
                    .sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());
                expect(newChanges.length).toBe(3);
                expect(newChanges[0].statusChange).toBe("OnlineToOffline");
                expect(newChanges[1].statusChange).toBe("OfflineToRestarting");
                expect(newChanges[2].statusChange).toBe("RestartingToOnline");

                // second, check that we can still connect to the agent
                await connectTestUtils.runShellConnectTest(testTarget, `target restart test - ${systemTestUniqueId}`, true);

            }, 60 * 1000);
        });
    });
}