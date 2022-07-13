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
import { ssmUser, getTargetInfo, expectIncludeStmtInConfig, expectTargetsInBzConfig } from '../utils/ssh-utils';

export const sshSuite = () => {
    describe('ssh suite', () => {
        let policyService: PolicyHttpService;

        const badTargetUser = 'bad-user';
        const uniqueUser = `user-${systemTestUniqueId}`;
        let testUtils: TestUtils;
        let testPassed = false;

        const userConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-user'
        );

        const bzSsmConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-ssm'
        );

        const bzBzeroConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-bzero'
        );

        beforeAll(() => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);
        });

        afterEach(async () => {
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);
            testPassed = false;
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
            // delete outstanding configuration files
            removeIfExists(userConfigFile);
            removeIfExists(bzSsmConfigFile);
            removeIfExists(bzBzeroConfigFile);
        });

        test('2156: (SSM) generate sshConfig', async () => {
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
                targetUsers: [{ userName: ssmUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzSsmConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzSsmConfigFile);

            const bzConfigContents = fs.readFileSync(bzSsmConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            testPassed = true;

            // expect the default username to appear in the bz-config
            expect(bzConfigContents.includes(ssmUser)).toBe(true);
        }, 60 * 1000);

        test('49582: (Bzero) generate sshConfig', async () => {
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
                targetUsers: [{ userName: bzeroTargetCustomUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzBzeroConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzBzeroConfigFile);

            const bzConfigContents = fs.readFileSync(bzBzeroConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            testPassed = true;

            // expect the default username to appear in the bz-config
            expect(bzConfigContents.includes(bzeroTargetCustomUser)).toBe(true);

        }, 60 * 1000);


        test('2157: generate sshConfig with multiple users', async () => {
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
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzSsmConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzSsmConfigFile);

            const bzConfigContents = fs.readFileSync(bzSsmConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);
        }, 60 * 1000);

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
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzSsmConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzSsmConfigFile);

            const bzConfigContents = fs.readFileSync(bzSsmConfigFile).toString();
            // expect none of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, false);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            testPassed = true;

        }, 60 * 1000);

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshCaseId}: ssh tunnel - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
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
                    targetUsers: [{ userName: bzeroTargetCustomUser }, { userName: ssmUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });

                const { userName, targetName } = getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzSsmConfigFile]);

                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${userName}@${targetName} "sudo echo success"`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');

                testPassed = true;

            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshCaseId}: connect should fail with only tunnel policy - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {

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
                    targetUsers: [{ userName: bzeroTargetCustomUser }, { userName: ssmUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });

                const { targetName } = getTargetInfo(testTarget);

                const expectedErrorMessage = 'Expected error';
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                    throw new Error(expectedErrorMessage);
                });
                // Call "zli connect"
                const connectPromise = callZli(['connect', `${ssmUser}@${targetName}`]);

                await expect(connectPromise).rejects.toThrow(expectedErrorMessage);

                testPassed = true;

            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.badSshCaseId}: ssh tunnel bad user - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {

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
                    targetUsers: [{ userName: bzeroTargetCustomUser }, { userName: ssmUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });

                // Try to ssh connect with a bad user
                const { targetName } = getTargetInfo(testTarget);
                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${badTargetUser}@${targetName} echo success`;

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
                expect(stdError).toMatch(new RegExp(`You do not have permission to tunnel as targetUser: ${badTargetUser}.\nCurrent allowed users for you: ${bzeroTargetCustomUser},${ssmUser}`));

                testPassed = true;

            }, 60 * 1000);
        });
    });
};
