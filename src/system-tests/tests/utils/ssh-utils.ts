import fs from 'fs';

import { allTargets, testTargets, configService, logger } from '../system-test';
import { DigitalOceanBZeroTarget, DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestTarget } from '../system-test.types';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { EnvironmentHttpService } from '../../../../src/http-services/environment/environment.http-services';
import { EnvironmentSummary } from '../../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';

export const ssmUser = 'ssm-user';

// type-agnostic way to get information about a target
export async function getTargetInfo(testTarget: TestTarget): Promise<SshTargetInfo> {
    const doTarget = testTargets.get(testTarget);
    let userName, targetName, targetId, environmentName: string;
    let target: DigitalOceanSSMTarget | DigitalOceanBZeroTarget;
    let environment: EnvironmentSummary;
    const environmentService = new EnvironmentHttpService(configService, logger);
    if (doTarget.type === 'ssm') {
        userName = ssmUser;
        target = doTarget as DigitalOceanSSMTarget;
        targetName = target.ssmTarget.name;
        targetId = target.ssmTarget.id;
    } else {
        userName = bzeroTargetCustomUser;
        target = doTarget as DigitalOceanBZeroTarget;
        targetName = target.bzeroTarget.name;
        targetId = target.bzeroTarget.id;
        environment = await environmentService.GetEnvironment(target.bzeroTarget.environmentId);
        environmentName = environment.name;
    }
    return { userName, targetName, targetId, environmentName };
}

/**
 * Helper functions to reduce test redundancy
 */
export function expectIncludeStmtInConfig(userFile: string, bzFile: string): void {
    const includeStmt = `Include ${bzFile}`;
    const userConfigContents = fs.readFileSync(userFile).toString();
    expect(userConfigContents.includes(includeStmt)).toBe(true);
}
export async function expectTargetsInBzConfig(contents: string, toBe: boolean): Promise<void> {
    for (const testTarget of allTargets) {
        const { targetName, environmentName } = await getTargetInfo(testTarget);
        expect(contents.includes(targetName)).toBe(toBe);
        if(environmentName) {
            const hostNameWithEnv = targetName + '.' + environmentName;
            expect(contents.includes(hostNameWithEnv)).toBe(toBe);
        }
    }
}

// data to populate a valid SSH request from a general target
export interface SshTargetInfo {
    userName: string
    targetName: string
    targetId: string
    environmentName: string
}