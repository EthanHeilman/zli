import {
    SSHConfigHostBlock,
    ValidSSHHost,
    SSHHostConfig,
    SSHConfigParseError,
    InvalidSSHHost,
    ValidSSHHostAndConfig,
    RegistrableSSHHost,
    RegisteredSSHHost,
    BzeroAlreadyInstalledError
} from 'services/quickstart/quickstart.service.types';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { readFile } from 'utils/utils';

import SSHConnection from 'ssh2-promise/lib/sshConnection';
import path from 'path';
import os from 'os';
import prompts, { PromptObject } from 'prompts';
import { KeyEncryptedError, parsePrivateKey } from 'sshpk';
import { Retrier } from '@jsier/retrier';
import chalk from 'chalk';
import { ConsoleWithTranscriptService } from 'services/consoleWithTranscript/consoleWithTranscript.service';
import { TranscriptMessage } from 'services/consoleWithTranscript/consoleWithTranscript.types';
import ora from 'ora';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { TargetUser } from 'webshell-common-ts/http/v2/policy/types/target-user.types';
import { Verb } from 'webshell-common-ts/http/v2/policy/types/verb.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { ScriptTargetNameOption } from 'webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { getBashAutodiscoveryScript } from 'http-services/auto-discovery-script/auto-discovery-script.http-services';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { BzeroAgentSummary } from 'webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';

export class QuickstartService {
    constructor(
        private logger: Logger,
        private consoleAndTranscript: ConsoleWithTranscriptService,
        private configService: ConfigService,
        private policyHttpService: PolicyHttpService,
        private environmentHttpService: EnvironmentHttpService
    ) { }

    /**
     * Polls the bastion until the bzero target is Online and the agent version is
     * known.
     * @param bzeroTargetName The name of the target to poll
     * @param targetsToExclude Targets that should be excluded when trying to find the target to poll. This should
     *   be targets that existed before quickstart attempts the bzero installation.
     * @returns Information about the target
     */
    private async pollBzeroTargetOnline(bzeroTargetName: string, targetsToExclude: BzeroAgentSummary[] = []): Promise<BzeroAgentSummary> {
        let targetsToExcludeMap: {[id: string]: BzeroAgentSummary};
        if (targetsToExclude.length > 0) {
            targetsToExcludeMap = targetsToExclude.reduce((map, target) => ({...map, [target.id]: target}), {});
        }

        // Try 60 times with a delay of 10 seconds between each attempt (10 min).
        const retrier = new Retrier({
            limit: 60,
            delay: 1000 * 10
        });

        const bzeroTargetHttpService = new BzeroTargetHttpService(this.configService, this.logger);
        let targetId: string;

        return retrier.resolve(() => new Promise<BzeroAgentSummary>(async (resolve, reject) => {
            const checkTarget = (bzeroTarget: BzeroAgentSummary) => {
                if (bzeroTarget.status === TargetStatus.Online) {
                    resolve(bzeroTarget);
                } else {
                    this.logger.debug(`Target ${bzeroTarget.name} has status:${bzeroTarget.status.toString()} and agentVersion:${bzeroTarget.agentVersion}`);
                    reject(`Target ${bzeroTarget.name} is not online.`);
                }
            };

            try {
                if (!targetId) {
                    // Get all bzero targets and look for one with name matching bzeroTargetName.
                    let bzeroTargets = await bzeroTargetHttpService.ListBzeroTargets();
                    if (targetsToExcludeMap) {
                        // Remove exluded targets from new list of targets.
                        bzeroTargets = bzeroTargets.filter(target => !targetsToExcludeMap[target.id]);
                    }

                    const foundTarget = bzeroTargets.find(target => target.name === bzeroTargetName);
                    if (foundTarget) {
                        targetId = foundTarget.id;
                        checkTarget(foundTarget);
                    } else {
                        throw new Error(`No target named ${bzeroTargetName} was found.`);
                    }
                } else {
                    const bzeroTarget = await bzeroTargetHttpService.GetBzeroTarget(targetId);
                    checkTarget(bzeroTarget);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Check to see if an agent is already installed on a host
     * @param sshConnection SSH connection to the host to be checked
     * @param hostName Name of the host
     * @returns True if the agent is already installed. False otherwise.
     */
    private async isAgentAlreadyInstalled(sshConnection: SSHConnection, hostName: string): Promise<boolean> {
        try {
            // Check to see if agent is already installed on this host
            //
            // NOTE: We don't handle the edge case where the executable name
            // has changed since the target was first registered. In this
            // edge case, the target will be registered again.
            await sshConnection.exec(`bzero --version`);
        } catch {
            // exec() throws an error if the command fails to run (e.g. agent
            // binary not found)
            this.logger.debug(`Agent not found on host ${hostName}`);
            return false;
        }

        // If the catch block wasn't hit, then we know the agent is installed as
        // the command succeeded.
        return true;
    }

    /**
     * Attempts to add a registrable SSH host to BastionZero. Fails with a
     * rejected promise if any step of the registration process fails: getting
     * autodiscovery script from Bastion, running autodiscovery script, and
     * polling for target to be online.
     *
     * Note: This function fails if it is found that the passed in SSH host has
     * an agent already installed on it.
     * @param registrableHost The SSH host to register
     * @param spinner The global progress bar object that is displayed to the
     * user
     * @returns Target summary of the newly registered host and the
     * corresponding SSH host config block
     */
    public async addSSHHostToBastionZero(registrableHost: RegistrableSSHHost, spinner: ora.Ora): Promise<RegisteredSSHHost> {
        return new Promise<RegisteredSSHHost>(async (resolve, reject) => {
            try {
                const bzeroTargetService = new BzeroTargetHttpService(this.configService, this.logger);
                const preexistingBzeroTargets = await bzeroTargetService.ListBzeroTargets();
                const targetName = await this.runAutodiscoveryOnSSHHost(registrableHost);

                // Poll for "Online" status
                const target = await this.pollBzeroTargetOnline(targetName, preexistingBzeroTargets);
                this.logger.debug(`Bastion assigned SSH host ${registrableHost.host.sshHost.name} with the following unique target id: ${target.id}`);

                // Add success message to current prefixText of the spinner and push to transcript
                const successMsg = chalk.green(`✔ SSH host ${registrableHost.host.sshHost.name} successfully added to BastionZero!`);
                this.consoleAndTranscript.pushToTranscript(successMsg);
                spinner.prefixText = spinner.prefixText + successMsg + '\n';

                resolve({ targetSummary: target, sshHost: registrableHost.host.sshHost});
            } catch (error) {
                // Add fail message to current prefixText of the spinner and push to transcript
                let errorMessage;
                if (error instanceof BzeroAlreadyInstalledError) {
                    errorMessage = chalk.red(`BastionZero is already installed on SSH host: ${registrableHost.host.sshHost.name}. This target will be skipped.`);
                } else {
                    errorMessage = chalk.red(`✖ Failed to add SSH host: ${registrableHost.host.sshHost.name} to BastionZero. ${error}`);
                }

                this.consoleAndTranscript.pushToTranscript(errorMessage);
                spinner.prefixText = spinner.prefixText + errorMessage + '\n';

                reject(error);
            }
        });
    }

    /**
     * Connects to an SSH host and runs the universal autodiscovery script on
     * it. This function returns a rejected promise if:
     * - The SSH connection failed
     * - The agent is already installed on the machine
     * - A failure to receive the autodiscovery script from the Bastion
     * - A failure to start the autodiscovery script
     * - If the autodiscovery script returns a non-zero exit status code
     * - A failure to parse the machine's Bzero target ID
     * @param registrableSSHHost The SSH host to run the autodiscovery script on
     * @returns The hostname, which is also the target name, of the newly registered host
     */
    private async runAutodiscoveryOnSSHHost(registrableSSHHost: RegistrableSSHHost): Promise<string> {
        const sshConfig = registrableSSHHost.host.config;
        const hostName = registrableSSHHost.host.sshHost.name;

        // Timeout the ssh connection handshake after 20s and dont retry
        sshConfig.readyTimeout = 20 * 1000;
        sshConfig.reconnect = false;

        // Start SSH connection
        const ssh = new SSHConnection(sshConfig);
        let conn: SSHConnection;
        try {
            conn = await ssh.connect(sshConfig);
            this.logger.debug(`SSH connection established with host: ${hostName}`);
        }
        catch (error) {
            throw new Error(`Failed to establish SSH connection: ${error}`);
        }

        // Wrap everything in a try+finally block so that we close the SSH
        // connection on any kind of failure
        try {
            // Check to see if the host has already been registered by checking
            // to see if the agent is installed
            if (await this.isAgentAlreadyInstalled(conn, hostName)) {
                // We don't want to register twice, so fail early
                //
                // NOTE: Instead of throwing an error, a better design would be
                // to return the target ID of the already registered target.
                // It improves the quickstart experience in the following ways:
                // (1) User's SSH config for an already registered SSH host can
                // have a new username => New policy will be created with new
                // TargetUser.
                // (2) If user picked this host as the target to connect to in
                // the end, it will still work.
                // (3) The target is still displayed in final summary that is
                // printed at the end of quickstart.
                //
                // We can't make this improvement right now as the agent doesn't
                // know its own ID (we don't store it in the agent)
                throw new BzeroAlreadyInstalledError('Agent is already installed');
            }

            // Get autodiscovery script
            //
            // The registered target's name will match the Bash hostname of the target machine
            const script = await getBashAutodiscoveryScript(this.logger, this.configService, registrableSSHHost.envId, ScriptTargetNameOption.BashHostName);

            // Run script on target
            const execAutodiscoveryScriptCmd = `bash << 'endmsg'\n${script}\nendmsg`;
            const execAutodiscoveryScript = new Promise<string>(async (resolve, reject) => {
                conn.spawn(execAutodiscoveryScriptCmd)
                    .then(socket => {
                        this.logger.debug(`Running autodiscovery script on host: ${hostName}`);

                        socket.on('data', (data: Buffer) => {
                            // Log stdout
                            const dataAsStr = data.toString();
                            this.logger.debug(`STDOUT: ${dataAsStr}`);
                        });

                        socket.on('close', async (code: number) => {
                            if (code == 0) {
                                this.logger.debug(`Successfully executed autodiscovery script on host: ${hostName}`);
                                // Get the actual hostname from the target since it could be different than what is defined
                                // in the the SSH config file.
                                const targetName = (await conn.exec('hostname')).trim(); // hostname includes newline so trim it

                                if (targetName) {
                                    resolve(targetName);
                                } else {
                                    reject(`Failed to find target name.`);
                                }
                            } else {
                                reject(`Failed to execute autodiscovery script. Error code: ${code}`);
                            }
                        });
                    })
                    .catch(err => {
                        reject(`Error when attempting to execute autodiscovery script on host: ${hostName}. ${err}`);
                    });
            });

            // Wait for the script to finish executing
            const targetName = await execAutodiscoveryScript;
            return targetName;
        } finally {
            this.logger.debug(`Closing SSH connection with host: ${hostName}`);
            await conn.close();
            this.logger.debug(`Closed SSH connection with host: ${hostName}`);
        }
    }

    /**
     * Display a prompt asking the user if they wish to skip the host or exit
     * out of quickstart
     * @param hostName Name of the host
     * @param onCancel Handler function for interruption of the prompt (e.g.
     * CTRL-C, ESC, etc.)
     * @returns True if the user wishes to skip the host. False if the user
     * wishes to exit.
     */
    public async promptSkipHostOrExit(hostName: string, onCancelPrompt: (prompt: PromptObject, answers: any) => void, onSubmitPrompt: (prompt: PromptObject, answer: any) => void): Promise<boolean> {
        const confirmSkipOrExit = await prompts({
            type: 'toggle',
            name: 'value',
            message: `Do you want to skip host ${hostName} or exit?`,
            initial: true,
            active: 'skip',
            inactive: 'exit',
        }, { onCancel: onCancelPrompt, onSubmit: onSubmitPrompt });

        return confirmSkipOrExit.value;
    }

    private visualSuccess(text: string) {
        this.consoleAndTranscript.log(chalk.green(`✔ ${text}`));
    }

    private visualError(text: string) {
        this.consoleAndTranscript.log(chalk.red(`✖ ${text}`));
    }

    private visualWarning(text: string) {
        this.consoleAndTranscript.log(chalk.yellow(`⚠ ${text}`));
    }

    /**
     * Converts parsed valid SSH hosts from the SSH config file to SSHConfigs
     * that are usable by the ssh2-promise library. This process is interactive
     * as it also checks to see if the IdentityFile (SSH key) is encrypted. If
     * the key is encrypted, we prompt the user to enter the passphrase so that
     * we can decrypt it and use when building the SSH connection later.
     * @param hosts List of valid SSH hosts
     * @param onExit Action to perform if user chooses the "exit" option in the
     * skip host or exit prompt
     * @param onSubmitPrompt Action to perform if user submits an answer in any
     * presented prompt
     * @param onCancelPrompt Action to perform if user cancels the skip host or
     * exit prompt
     * @returns A list of valid SSH hosts with their corresponding SSHConfig
     * configurations for use with the ssh2-promise library
     */
    public async promptConvertValidSSHHostsToSSHConfigs(
        hosts: ValidSSHHost[],
        onExit: (exitCode: number, logger: Logger, transcript: readonly TranscriptMessage[]) => Promise<void>,
        onSubmitPrompt: (prompt: PromptObject, answer: any) => void,
        onCancelPrompt: (prompt: PromptObject, answers: any) => void
    ): Promise<ValidSSHHostAndConfig[]> {
        const sshConfigs: ValidSSHHostAndConfig[] = [];
        for (const host of hosts) {
            // Try to read the IdentityFile and store its contents in keyFile variable
            let keyFile: string;
            try {
                keyFile = await readFile(host.identityFile);
            } catch (err) {
                // Note: Even though we have removed SSH hosts with unreadable
                // SSH keys before calling this function, it is still possible
                // for the file to be unreadable at this point (e.g. system
                // changed in between calls)
                this.logger.debug(`Error when reading ${host.name}'s SSH key: ${err}`);

                // Product requirement: Do not show visual indication that the
                // key is wrong at this point. We will show the failure later
                // when we try to SSH in
            }

            // Check if IdentityFile is encrypted.
            let passphraseKeyFile: string;
            if (keyFile) {
                try {
                    parsePrivateKey(keyFile, 'auto');
                } catch (err) {
                    if (err instanceof KeyEncryptedError) {
                        this.consoleAndTranscript.log(`${host.name}'s SSH key (${host.identityFile}) is encrypted!`);

                        // Ask user for password to decrypt the key file
                        const passwordResponse = await this.handleEncryptedIdentityFile(host.identityFile, keyFile, onSubmitPrompt);

                        // Check if user wants to skip this host or exit immediately
                        if (passwordResponse === undefined) {
                            const shouldSkip = await this.promptSkipHostOrExit(host.name, onCancelPrompt, onSubmitPrompt);

                            if (shouldSkip) {
                                this.visualWarning(`Skipping ${host.name}`);
                                continue;
                            } else {
                                this.consoleAndTranscript.log('Prompt cancelled. Exiting out of quickstart...');

                                await onExit(1, this.logger, this.consoleAndTranscript.getTranscript());
                            }
                        } else {
                            passphraseKeyFile = passwordResponse;
                        }
                    } else {
                        this.logger.debug(`Error when parsing ${host.name}'s SSH key: ${err}`);

                        // Product requirement: Do not show visual indication at
                        // this point
                    }
                }
            }

            // Convert from ValidSSHHost to ValidSSHConfig
            sshConfigs.push({
                sshHost: host,
                config: {
                    host: host.hostIp,
                    username: host.username,
                    identity: host.identityFile,
                    port: host.port,
                    passphrase: passphraseKeyFile
                }
            });
        }

        return sshConfigs;
    }

    /**
     * Prompt the user to provide their passphrase to handle an encrypted
     * identity file (SSH key).
     * @param identityFilePathName File path to key
     * @param identityFileContents Contents of the key
     * @returns A valid passphrase that correctly decrypts the SSH key.
     * Undefined if the user cancels the prompt.
     */
    private async handleEncryptedIdentityFile(identityFilePathName: string, identityFileContents: string, onSubmitPrompt: (prompt: PromptObject, answer: any) => void): Promise<string | undefined> {
        return new Promise<string | undefined>(async (resolve, _) => {
            const onCancel = (prompt: PromptObject) => {
                this.consoleAndTranscript.pushToTranscript(`${prompt.message}`);
                resolve(undefined);
            };
            const onSubmit = (prompt: PromptObject, answer: string) => {
                onSubmitPrompt(prompt, '<REDACTED>');
                resolve(answer);
            };

            // Custom validation function. Require value to be passed and check
            // if password is correct
            const onValidate = (value: any): string | boolean => {
                if (value) {
                    try {
                        parsePrivateKey(identityFileContents, 'auto', { passphrase: value });

                        // Password is correct!
                        return true;
                    } catch (err) {
                        // Password is either wrong or there was some error when reading the IdentityFile
                        return 'Failed reading file with provided passphrase. Use CTRL-C to skip this host';
                    }
                } else {
                    return 'Value is required. Use CTRL-C to skip this host';
                }
            };

            await prompts({
                type: 'password',
                name: 'value',
                message: `Enter the passphrase for the encrypted SSH key ${identityFilePathName}:`,
                validate: onValidate
            }, { onSubmit: onSubmit, onCancel: onCancel });
        });
    }

    /**
     * Create an environment following the quickstart format (description +
     * cleanupTimeout)
     * @param sshUsername Username that all hosts in this environment should
     * have TargetConnect policies for (with TargetUser=sshUsername) once
     * quickstart finishes successfully
     * @param envName Name of environment
     * @returns Returns the ID of the newly created environment
     */
    private async createQuickstartEnvironment(sshUsername: string, envName: string): Promise<string> {
        const createEnvResp = await this.environmentHttpService.CreateEnvironment({
            name: envName,
            description: `Quickstart autogenerated environment for ${sshUsername} users`,
            offlineCleanupTimeoutHours: 1
        });
        return createEnvResp.id;
    }

    /**
    * Create a TargetConnect policy that permits:
    * - Subject: The user running quickstart
    * - Action: To perform the following three verbs with TargetUser (unix
        username) == the parsed SSH username: open a shell connection, create an
        SSH tunnel, and perform FUD.
    * - Context: To any target in the environment as specified by envId
     * @param sshUsername Username to use for the TargetUser parameter
     * @param envId ID of environment in which this policy applies to
     * @param policyName Name of the policy
     * @returns Summary of the newly created policy
     */
    private async createQuickstartTargetConnectPolicy(sshUsername: string, envId: string, policyName: string): Promise<TargetConnectPolicySummary> {
        const environment: Environment = { id: envId };
        const targetUser: TargetUser = { userName: sshUsername };
        const verbs: Verb[] = [
            { type: VerbType.Shell },
            { type: VerbType.Tunnel },
            { type: VerbType.FileTransfer },
        ];

        const userAsSubject: Subject = {
            id: this.configService.me().id,
            type: SubjectType.User
        };

        return await this.policyHttpService.AddTargetConnectPolicy({
            name: policyName,
            subjects: [userAsSubject],
            groups: [],
            description: `Quickstart autogenerated policy for ${sshUsername} users`,
            environments: [environment],
            targets: [],
            targetUsers: [targetUser],
            verbs: verbs
        });
    }

    /**
     * Creates an environment for each unique SSH username in the parsed SSH
     * hosts. If the environment already exists, no environment will be created.
     * @param hostsToAdd A list of valid SSH hosts in which environments should
     * be created for
     * @returns A list of registrable SSH hosts. Each registrable host includes
     * the environment ID in which the host should be registered in during the
     * autodiscovery process. The returned list may be smaller than the input
     * list if the request to create the environment fails.
     */
    public async createEnvForUniqueUsernames(hostsToAdd: ValidSSHHostAndConfig[]): Promise<RegistrableSSHHost[]> {
        const registrableSSHHosts: RegistrableSSHHost[] = [];
        const usernameMap: Map<string, ValidSSHHostAndConfig[]> = new Map();

        // Build map of common SSH usernames among the hosts that are expected
        // to be successfully added to BastionZero
        for (const host of hostsToAdd) {
            // Normalize to lowercase
            const usernameMatch = host.sshHost.username.toLowerCase();
            if (usernameMap.has(usernameMatch)) {
                // Update the list with the matching host
                const matchingTargets = usernameMap.get(usernameMatch);
                matchingTargets.push(host);
            } else {
                // Otherwise create new list starting with one host
                usernameMap.set(usernameMatch, [host]);
            }
        }

        // Create an environment per common SSH username
        for (const [username, hosts] of usernameMap) {
            const quickstartEnvName = `${username}-users_quickstart`;
            let quickstartEnvId: string;
            try {
                const envs = await this.environmentHttpService.ListEnvironments();
                const quickstartEnv = envs.find(env => env.name === quickstartEnvName);
                if (quickstartEnv === undefined) {
                    // Quickstart env for this ssh username does not exist

                    // Create new environment
                    quickstartEnvId = await this.createQuickstartEnvironment(username, quickstartEnvName);
                } else {
                    // Environment already exists
                    quickstartEnvId = quickstartEnv.id;
                }

                // Convert hosts to registrable hosts with accompanying
                // environment id to use during registration
                hosts.forEach(host => registrableSSHHosts.push({ host: host, envId: quickstartEnvId }));
            } catch (err) {
                this.visualError(`Failed creating environment for SSH username ${username}: ${err}`);
                continue;
            }
        }

        return registrableSSHHosts;
    }

    /**
     * Creates a policy for each unique SSH username in the parsed SSH hosts. If
     * the policy already exists, no new policy will be created.
     * @param registeredSSHHosts A list of SSH hosts that were successfully
     * registered
     * @returns A list of targets which are most likely connectable. The
     * list will be smaller than the input list if the request to create the
     * policy fails.
     *
     * We say that the hosts are most likely connectable because there is no
     * absolute guarantee that the created policy (or the retrieved policy in
     * the case that the policy already exists) will permit the user running
     * quickstart to connect to their targets. Some bad scenarios include:
     * - There exists a policy with the expected name, but it does not actually
     *   permit the user running quickstart to connect.
     * - The created policy (in the case that no expected policy exists) is
     *   changed or removed before quickstart actually makes the connection.
     */
    public async createPolicyForUniqueUsernames(registeredSSHHosts: RegisteredSSHHost[]): Promise<RegisteredSSHHost[]> {
        const connectableTargets: RegisteredSSHHost[] = [];
        const usernameMap: Map<string, RegisteredSSHHost[]> = new Map();

        // Build map of common SSH usernames among the targets that were
        // successfully added to BastionZero
        for (const target of registeredSSHHosts) {
            // Normalize to lowercase
            const usernameMatch = target.sshHost.username.toLowerCase();
            if (usernameMap.has(usernameMatch)) {
                // Update the list with the matching target
                const matchingTargets = usernameMap.get(usernameMatch);
                matchingTargets.push(target);
            } else {
                // Otherwise create new list starting with one target
                usernameMap.set(usernameMatch, [target]);
            }
        }

        // Create a policy per common SSH username
        for (const [username, targets] of usernameMap) {
            const quickstartPolicyName = `${username}-users-policy_quickstart`;
            try {
                // Ensure that quickstart policy exists for this SSH username.
                const targetConnectPolicies = await this.policyHttpService.ListTargetConnectPolicies();
                if (targetConnectPolicies.find(policy => policy.name === quickstartPolicyName) === undefined) {
                    // Quickstart policy for this ssh username does not exist

                    // All targets with the same SSH username were registered in
                    // the same environment
                    const envId = targets[0].targetSummary.environmentId;

                    // Create new policy
                    await this.createQuickstartTargetConnectPolicy(username, envId, quickstartPolicyName);
                }

                // Either the policy already exists, or we've just successfully
                // created one. Add all targets to final list of
                // connectableTargets.
                //
                // NOTE: It's entirely possible that even though the policy
                // exists with the correct name above, the policy has been
                // changed in such a way that shell connect becomes impossible
                // for these targets (e.g. current user removed from list of
                // subjects, connect verb removed, etc.). We've chosen not to
                // cover this edge case.
                targets.forEach(target => connectableTargets.push(target));
            } catch (err) {
                this.visualError(`Failed creating policy for SSH username ${username}: ${err}`);
                continue;
            }
        }

        return connectableTargets;
    }

    /**
     * Reads all SSH keys in the map of hosts checking to see which keys are
     * readable/found on disk.
     * @param hosts Map of hosts
     * @returns A map of hosts whose SSH keys are readable
     */
    public async getSSHHostsWithValidSSHKeys(hosts: Map<string, ValidSSHHost>): Promise<Map<string, ValidSSHHost>> {
        const validHosts: Map<string, ValidSSHHost> = new Map();
        for (const [hostName, host] of hosts) {
            try {
                await readFile(host.identityFile);
            } catch (err) {
                this.logger.debug(`Error when reading ${hostName}'s SSH key: ${err}`);
                continue;
            }

            // Host has readable SSH key if we've reached this point
            validHosts.set(hostName, host);
        }

        return validHosts;
    }

    /**
     * Parse SSH hosts from a valid ssh_config(5)
     * (https://linux.die.net/man/5/ssh_config)
     * @param sshConfig Contents of the ssh config file
     * @returns A 2-tuple.
     *
     * The first element contains a mapping of all valid SSH hosts. The key is
     * the SSH host's name. The value is an interface containing information
     * about the host. A valid SSH host is defined as one that has enough
     * information about it in the parsed config file, so that it can be used
     * with the ssh2-promise library. There is no guarantee that a valid ssh
     * host is successfully connectable (e.g. network issue, encrypted key file,
     * invalid IP/host, file not found at path, etc.).
     *
     * The second element contains a list of all invalid SSH hosts. Each invalid
     * SSH host contains an associated list of parse errors and an incomplete
     * ValidSSHHost (e.g. some required parameters were included).
     */
    public parseSSHHosts(sshConfig: string): [hosts: Map<string, ValidSSHHost>, invalidSSHHosts: InvalidSSHHost[]] {
        // Parse sshConfig content to usable HostBlock types
        const SSHConfig = require('ssh-config');
        const config: [] = SSHConfig.parse(sshConfig);
        const hostBlocks: SSHConfigHostBlock[] = config.filter((elem: any) => elem.param && elem.param.toLowerCase() === 'host');

        const seen: Map<string, boolean> = new Map();
        const validHosts: Map<string, ValidSSHHost> = new Map();
        const invalidSSHHosts: InvalidSSHHost[] = [];

        for (const hostBlock of hostBlocks) {
            const name = hostBlock.value;
            // Skip global directive
            if (name === '*') {
                continue;
            }

            // Skip host if already found. Print warning to user. This behavior
            // is on par with how ssh works with duplicate hosts (the first host
            // is used and the second is skipped).
            if (seen.has(name)) {
                this.visualWarning(`Already seen SSH host with Host == ${name}. Keeping the first one seen.`);
                continue;
            }
            seen.set(name, true);

            // Rolling build of valid SSH host
            const validSSHHost = {} as ValidSSHHost;
            validSSHHost.name = name;

            // Array holds all config parse errors found while parsing
            const parseErrors: SSHConfigParseError[] = [];
            const config = hostBlock.config;

            // Parse required SSH config parameters
            const hostIp = this.getSSHHostConfigValue('HostName', config);
            if (hostIp === undefined) {
                parseErrors.push({ error: 'missing_host_name' });
            } else {
                validSSHHost.hostIp = hostIp;
            }
            const port = this.getSSHHostConfigValue('Port', config);
            if (port === undefined) {
                // Default to port 22 if the Port parameter is missing (this
                // follows how the standard SSH command works)
                validSSHHost.port = 22;
            } else {
                validSSHHost.port = parseInt(port);
            }
            const user = this.getSSHHostConfigValue('User', config);
            if (user === undefined) {
                parseErrors.push({ error: 'missing_user' });
            } else {
                validSSHHost.username = user;
            }
            const identityFilePath = this.getSSHHostConfigValue('IdentityFile', config);
            if (identityFilePath === undefined) {
                parseErrors.push({ error: 'missing_identity_file' });
            } else {
                validSSHHost.identityFile = this.resolveHome(identityFilePath);
            }

            if (parseErrors.length > 0) {
                invalidSSHHosts.push({
                    incompleteValidSSHHost: validSSHHost,
                    parseErrors: parseErrors
                });
                this.logger.debug(`Failed to parse host: ${name}`);
                continue;
            }

            validHosts.set(name, validSSHHost);
        }

        return [validHosts, invalidSSHHosts];
    }

    private getSSHHostConfigValue(matchingParameter: string, hostConfig: SSHHostConfig[]): string | undefined {
        const value = hostConfig.find(elem => elem.param && elem.param.toLowerCase() === matchingParameter.toLowerCase());
        if (value === undefined) {
            return undefined;
        } else {
            return value.value;
        }
    }

    private resolveHome(filepath: string) {
        if (filepath[0] === '~') {
            return path.join(os.homedir(), filepath.slice(1));
        }
        return filepath;
    }
}