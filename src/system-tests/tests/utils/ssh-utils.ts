import fs from 'fs';

import { allTargets, testTargets } from '../system-test';
import { DigitalOceanBZeroTarget, DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestTarget } from '../system-test.types';
import { ssmUser, bzeroUser } from '../system-test-setup';

// type-agnostic way to get information about a target
export function getTargetInfo(testTarget: TestTarget): SshTargetInfo {
    const doTarget = testTargets.get(testTarget);
    let userName, targetName: string;
    let target;
    if (doTarget.type === 'ssm') {
        userName = ssmUser;
        target = doTarget as DigitalOceanSSMTarget;
        targetName = target.ssmTarget.name;
    } else {
        userName = bzeroUser;
        target = doTarget as DigitalOceanBZeroTarget;
        targetName = target.bzeroTarget.name;
    }
    return { userName, targetName };
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
}