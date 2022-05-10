import path from 'path';
import fs from 'fs';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { promisify } from 'util';
import { exec } from 'child_process';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { configService, logger, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { removeIfExists } from '../../../utils/utils';
import { DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from '../system-test.types';
import { ssmTestTargetsToRun } from '../targets-to-run';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';

export const sshSuite = () => {
    describe('ssh suite', () => {
        let policyService: PolicyHttpService;

        const ssmUser = 'ssm-user';
        const ec2User = 'ec2-user';
        const badTargetUser = 'bad-user';
        const uniqueUser = `user-${systemTestUniqueId}`;

        const userConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-user'
        );

        const bzConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-bz'
        );

        beforeAll(() => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
            // delete outstanding configuration files
            removeIfExists(userConfigFile);
            removeIfExists(bzConfigFile);
        });

        test('2156: generate sshConfig', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: ssmUser }, { userName: ec2User }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            // TODO: can be reinstated when transition to bzero agents is complete
            // expect the default username to appear in the bz-config
            //expect(bzConfigContents.includes(targetUser)).toBe(true);

            // don't delete policies, because ssh tunnel tests need them
        }, 60 * 1000);

        ssmTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshCaseId}: ssh tunnel - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                // use the config file we just created to ssh without specifying a user or identity file
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
                const user = doTarget.type === 'ssm' ? ssmUser : ec2User;
                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${user}@${doTarget.ssmTarget.name} echo success`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');

            }, 60 * 1000);
        });

        ssmTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshCaseId}: connect should fail with only tunnel policy - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                // use the config file we just created to ssh without specifying a user or identity file
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

                // Spy on result Bastion gives for shell auth details. This spy is
                // used at the end of the test to ensure it has not been called
                const shellConnectionAuthDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails');

                const expectedErrorMessage = 'Expected error';
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                    throw new Error(expectedErrorMessage);
                });
                // Call "zli connect"
                const connectPromise = callZli(['connect', `${ssmUser}@${doTarget.ssmTarget.name}`]);

                await expect(connectPromise).rejects.toThrow(expectedErrorMessage);

                // Assert shell connection auth details has not been called
                expect(shellConnectionAuthDetailsSpy).not.toHaveBeenCalled();

            }, 60 * 1000);
        });

        ssmTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.badSshCaseId}: ssh tunnel bad user - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                // Try to ssh connect with a bad user
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${badTargetUser}@${doTarget.ssmTarget.name} echo success`;

                const pexec = promisify(exec);
                let error = undefined;
                try {
                    await pexec(command);
                } catch (e) {
                    // The command should fail and we should set error
                    error = e;
                }

                // Ensure we see the expected error message
                expect(error).not.toEqual(undefined);
                const stdError = error.stderr;
                expect(stdError).toMatch(new RegExp(`(You do not have permission to tunnel as targetUser: ${badTargetUser}. Current allowed users for you: ssm-user)`));

            }, 60 * 1000);
        });

        /* TODO: can be reinstated when transition to bzero agents is complete
        test('2157: generate sshConfig with multiple users', async () => {
            // delete policy from previous test
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            //  create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: ssmUser }, { userName: uniqueUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

        }, 60 * 1000);
        */

        test('2158: generate sshConfig without tunnel access', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: uniqueUser }],
                verbs: [{ type: VerbType.Shell }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect none of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, false);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

        }, 60 * 1000);
    });
};

/**
 * Helper functions to reduce test redundancy
 */
function expectIncludeStmtInConfig(userFile: string, bzFile: string): void {
    const includeStmt = `Include ${bzFile}`;
    const userConfigContents = fs.readFileSync(userFile).toString();
    expect(userConfigContents.includes(includeStmt)).toBe(true);
}
function expectTargetsInBzConfig(contents: string, toBe: boolean): void {
    for (const testTarget of ssmTestTargetsToRun) {
        const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
        expect(contents.includes(doTarget.ssmTarget.name)).toBe(toBe);
    }
}