import fs from 'fs';

import { allTargets, testTargets } from '../system-test';
import { DigitalOceanBZeroTarget, DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestTarget } from '../system-test.types';
import { bzeroTargetCustomUser } from '../system-test-setup';

export const ssmUser = 'ssm-user';

// type-agnostic way to get information about a target
export function getTargetInfo(testTarget: TestTarget): SshTargetInfo {
    const doTarget = testTargets.get(testTarget);
    let userName, targetName, targetId: string;
    let target;
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
    }
    return { userName, targetName, targetId };
}

/**
 * Helper functions to reduce test redundancy
 */
export function expectIncludeStmtInConfig(userFile: string, bzFile: string): void {
    const includeStmt = `Include ${bzFile}`;
    const userConfigContents = fs.readFileSync(userFile).toString();
    expect(userConfigContents.includes(includeStmt)).toBe(true);
}
export function expectTargetsInBzConfig(contents: string, toBe: boolean): void {
    for (const testTarget of allTargets) {
        const { targetName } = getTargetInfo(testTarget);
        expect(contents.includes(targetName)).toBe(toBe);
    }
}

// data to populate a valid SSH request from a general target
export interface SshTargetInfo {
    userName: string
    targetName: string
    targetId: string
}