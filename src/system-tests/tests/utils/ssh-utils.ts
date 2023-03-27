import fs from 'fs';

import { allTargets, testTargets, configService, logger } from '../system-test';
import { DigitalOceanBZeroTarget } from '../../digital-ocean/digital-ocean-target.service.types';
import { TestTarget } from '../system-test.types';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { EnvironmentHttpService } from '../../../../src/http-services/environment/environment.http-services';

// get information about a target
export async function getTargetInfo(testTarget: TestTarget): Promise<SshTargetInfo> {
    const target = testTargets.get(testTarget) as DigitalOceanBZeroTarget;
    const environmentService = new EnvironmentHttpService(configService, logger);
    const environment = await environmentService.GetEnvironment(target.bzeroTarget.environmentId);
    return {
        userName: bzeroTargetCustomUser,
        targetName: target.bzeroTarget.name,
        targetId: target.bzeroTarget.id,
        environmentName: environment.name,
    };
}

/**
 * Helper functions to reduce test redundancy
 */
export function expectIncludeStmtInConfig(userFile: string, bzFile: string, exists: boolean = true): void {
    // add quotes around the file if we're on windows in case the user's file path includes a space
    const fileString = (process.platform === 'win32') ? "\"" + bzFile + "\"" : bzFile;

    const includeStmt = `Include ${fileString}`;
    const userConfigContents = fs.readFileSync(userFile).toString();
    expect(userConfigContents.includes(includeStmt)).toBe(exists);
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