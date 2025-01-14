import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { OPA_SYNC_TIME, RUN_AS_SERVICE_ACCOUNT, allTargets, configService, logger, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId } from 'system-tests/tests/system-test';
import { callZli } from 'system-tests/tests/utils/zli-utils';
import { bzeroTargetCustomUser, idpUsernameTargetCustomSA, idpUsernameTargetCustomUser } from 'system-tests/tests/system-test-setup';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { TestTarget } from 'system-tests/tests/system-test.types';
import { cleanupTargetConnectPolicies } from 'system-tests/tests/system-test-cleanup';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { getTargetInfo } from 'system-tests/tests/utils/ssh-utils';
import { sleepTimeout } from '../utils/test-utils';

export const sshSuite = () => {
    describe('ssh suite', () => {
        let policyService: PolicyHttpService;

        const targetConnectPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'ssh-target-connect');
        const badTargetUser = 'bad-user';
        const homedir = (process.platform === 'win32') ? process.env.HOMEPATH : process.env.HOME;

        const userConfigFile = path.join(
            homedir, '.ssh', 'test-config-user'
        );

        const bzConfigFile = path.join(
            homedir, '.ssh', 'test-config'
        );

        const scpUpFile = path.join(
            homedir, '.ssh', 'test-scp-up-file'
        );

        const scpDownFile = path.join(
            homedir, '.ssh', 'test-scp-down-file'
        );

        const sftpBatchFile = path.join(
            homedir, '.ssh', 'test-scp-batch-file'
        );

        beforeAll(() => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
        });

        afterEach(async () => {
            await cleanupTargetConnectPolicies(targetConnectPolicyName);
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
            // delete outstanding configuration files
            fs.rmSync(userConfigFile, { force: true });
            fs.rmSync(bzConfigFile, { force: true });
            fs.rmSync(scpUpFile, { force: true });
            fs.rmSync(scpDownFile, { force: true });
            fs.rmSync(sftpBatchFile, { force: true });
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshCaseId}: ssh tunnel - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                const { userName, targetName } = await getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${userName}@${targetName} echo success`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');
            }, 60 * 1000);
        });

        // adding a success case for connecting to bzero targets via ssh using .environment
        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshWithEnvCaseId}: ssh tunnel with env - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                const { userName, targetName, environmentName } = await getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${userName}@${targetName}.${environmentName} echo success`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');
            }, 60 * 1000);
        });

        // adding a success case for connecting to bzero targets via ssh using idp username as target user
        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshWithIdpUsernameCaseId}: ssh tunnel with idp username - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: '{username}' }],
                    verbs: [{ type: VerbType.Tunnel }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                let targetUser = ``;
                if(RUN_AS_SERVICE_ACCOUNT) {
                    targetUser += `${idpUsernameTargetCustomSA}`;
                } else {
                    targetUser += `${idpUsernameTargetCustomUser}`;
                }

                const { targetName, environmentName } = await getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${targetUser}@${targetName}.${environmentName} echo success`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshConnectFailsCaseId}: connect fails with only tunnel policy - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {

                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                const { targetName, userName } = await getTargetInfo(testTarget);

                // Call "zli connect"
                const connectPromise = callZli(['connect', `${userName}@${targetName}`]);

                await expect(connectPromise).rejects.toThrow();
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshBadUserCaseId}: ssh tunnel bad user - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {

                const currentUser: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentUser],
                    groups: [],
                    description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                // Try to ssh connect with a bad user
                const { targetName } = await getTargetInfo(testTarget);
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
                expect(stdError).toMatch(new RegExp(`You do not have permission to create a tunnel to ${targetName} as target user: ${badTargetUser}.\nAllowed target users are: ${bzeroTargetCustomUser}`));
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshScpCaseId}: scp - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target file transfer policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.FileTransfer }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                const { targetName } = await getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                // make file
                const testData = 'TEST DATA';
                fs.writeFileSync(scpUpFile, testData);

                // copy file up to target
                const upCommand = `scp -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${scpUpFile} ${targetName}:~/${path.basename(scpUpFile)}`;

                const pexec = promisify(exec);
                await pexec(upCommand);

                // copy file down from target
                const downCommand = `scp -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${targetName}:~/${path.basename(scpUpFile)} ${scpDownFile} `;
                await pexec(downCommand);

                // check that we got it back
                expect(fs.readFileSync(scpDownFile).toString()).toEqual(fs.readFileSync(scpUpFile).toString());
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshSftpCaseId}: sftp - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target file transfer policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.FileTransfer }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                const { targetName } = await getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                // make data file
                const testData = 'TEST DATA';
                fs.writeFileSync(scpUpFile, testData);

                // make batch file
                fs.writeFileSync(sftpBatchFile, `put ${scpUpFile} ${path.basename(scpDownFile)}`);

                // copy file up to target
                const upCommand = `sftp -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no -b ${sftpBatchFile} ${targetName}`;

                const pexec = promisify(exec);
                await pexec(upCommand);

                // update batch file
                fs.writeFileSync(sftpBatchFile, `get ${path.basename(scpDownFile)} ${scpDownFile}`);

                // copy file down from target
                const downCommand = `sftp -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no -b ${sftpBatchFile} ${targetName}`;
                await pexec(downCommand);

                // check that we got it back
                expect(fs.readFileSync(scpDownFile).toString()).toEqual(fs.readFileSync(scpUpFile).toString());
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshTunnelFailsCaseId}: tunnel/exec fails when user only has file transfer access - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target file transfer policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.FileTransfer }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                const { targetName } = await getTargetInfo(testTarget);
                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${targetName} echo success`;

                // this *should* fail with the correct error -- if it doesn't, we have a big problem!
                const pexec = promisify(exec);
                try {
                    await pexec(command);
                    throw new Error('we were wrongly granted ssh access');
                } catch (err) {
                    expect(err.message).toContain('daemon error: unauthorized command: this user is only allowed to perform file transfer via scp or sftp, but received \'echo success\'');
                }
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshByUuidCaseId}: ssh using id instead of name - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.Tunnel }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                const { userName, targetId } = await getTargetInfo(testTarget);
                const configName = configService.getConfigName();
                let prefix = 'bzero-';
                if (configName != 'prod') {
                    prefix = `${configName}-${prefix}`;
                }
                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${userName}@${prefix}${targetId} echo success`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');
            }, 60 * 1000);
        });

        allTargets.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.sshScpByUuidCaseId}: scp using id instead of name - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const currentSubject: Subject = {
                    id: configService.me().id,
                    type: configService.me().type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                // create our policy
                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target file transfer policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: bzeroTargetCustomUser }],
                    verbs: [{ type: VerbType.FileTransfer }]
                });
                await sleepTimeout(OPA_SYNC_TIME);

                await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

                const { userName, targetId } = await getTargetInfo(testTarget);
                const configName = configService.getConfigName();
                let prefix = 'bzero-';
                if (configName != 'prod') {
                    prefix = `${configName}-${prefix}`;
                }

                // make file
                const testData = 'TEST DATA';
                fs.writeFileSync(scpUpFile, testData);

                // copy file up to target
                const upCommand = `scp -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${scpUpFile} ${userName}@${prefix}${targetId}:~/${path.basename(scpUpFile)}`;

                const pexec = promisify(exec);
                await pexec(upCommand);

                // copy file down from target
                const downCommand = `scp -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${userName}@${prefix}${targetId}:~/${path.basename(scpUpFile)} ${scpDownFile} `;
                await pexec(downCommand);

                // check that we got it back
                expect(fs.readFileSync(scpDownFile).toString()).toEqual(fs.readFileSync(scpUpFile).toString());
            }, 60 * 1000);
        });
    });
};
