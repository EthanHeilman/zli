import { includes } from 'lodash';
import { SemVer, lt, parse } from 'semver';
import { spawn, SpawnOptions, exec } from 'child_process';
import { promisify } from 'util';

import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { SsmTunnelService } from '../../services/ssm-tunnel/ssm-tunnel.service';
import { cleanExit } from '../clean-exit.handler';
import { targetStringExample } from '../../utils/utils';
import { ParsedTargetString } from '../../services/common.types';
import { EnvMap } from '../../cli-driver';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { BzeroAgentSummary } from '../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { copyExecutableToLocalDir, getBaseDaemonArgs } from '../../utils/daemon-utils';

// FIXME: revisit this, given pipelining version
const minimumAgentVersion = '6.1.0';

export async function sshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, keySplittingService: KeySplittingService, envMap: EnvMap, loggerConfigService: LoggerConfigService) {

    if (!sshTunnelParameters.parsedTarget) {
        logger.error('No targets matched your targetName/targetId or invalid target string, must follow syntax:');
        logger.error(targetStringExample);
        await cleanExit(1, logger);
    }

    let bzeroTarget: BzeroAgentSummary;
    let allowedTargetUsers: string[] = [];
    let allowedVerbs: string[] = [];

    if (sshTunnelParameters.parsedTarget.type === TargetType.SsmTarget) {
        const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
        const ssmTarget = await ssmTargetHttpService.GetSsmTarget(sshTunnelParameters.parsedTarget.id);
        allowedTargetUsers = ssmTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = ssmTarget.allowedVerbs.map(v => v.type);
    } else if (sshTunnelParameters.parsedTarget.type === TargetType.Bzero) {
        const bzeroTargetHttpService = new BzeroTargetHttpService(configService, logger);
        bzeroTarget = await bzeroTargetHttpService.GetBzeroTarget(sshTunnelParameters.parsedTarget.id);
        allowedTargetUsers = bzeroTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = bzeroTarget.allowedVerbs.map(v => v.type);
    }

    if (!allowedVerbs.includes(VerbType.Tunnel)) {
        logger.error('You do not have sufficient permission to open a ssh tunnel to the target');
        await cleanExit(1, logger);
    }

    if (!includes(allowedTargetUsers, sshTunnelParameters.parsedTarget.user)) {
        logger.error(`You do not have permission to tunnel as targetUser: ${sshTunnelParameters.parsedTarget.user}. Current allowed users for you: ${allowedTargetUsers}`);
        await cleanExit(1, logger);
    }

    if (sshTunnelParameters.parsedTarget.type === TargetType.SsmTarget) {
        const ssmTunnelService = new SsmTunnelService(logger, configService, keySplittingService, envMap.enableKeysplitting == 'true');
        ssmTunnelService.errors.subscribe(async errorMessage => {
            logger.error(errorMessage);
            await cleanExit(1, logger);
        });

        if (await ssmTunnelService.setupWebsocketTunnel(sshTunnelParameters.parsedTarget, sshTunnelParameters.port, sshTunnelParameters.identityFile)) {
            process.stdin.on('data', async (data) => {
                ssmTunnelService.sendData(data);
            });
            // this explicit close behavior is needed for an edge case
            // where we use BastionZero as an ssh proxy via `npm run start`
            // see this discussion for more: https://github.com/bastionzero/zli/pull/329#discussion_r831502123
            process.stdin.on('close', async () => {
                // closing the tunnel directly in this callback does not seem to work
                // await ssmTunnelService.closeTunnel();
                await cleanExit(0, logger);
            });
        }

        configService.logoutDetected.subscribe(async () => {
            logger.error('\nLogged out by another zli instance. Terminating ssh tunnel\n');
            await ssmTunnelService.closeTunnel();
            await cleanExit(0, logger);
        });
    } else if (sshTunnelParameters.parsedTarget.type == TargetType.Bzero) {
        // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
        const agentVersion = parse(bzeroTarget.agentVersion);
        if (agentVersion && lt(agentVersion, new SemVer(minimumAgentVersion))) {
            logger.error(`Tunneling to Bzero Target is only supported on agent versions >= ${minimumAgentVersion}. Agent version is ${agentVersion}`);
            return 1;
        }

        // Build our args and cwd
        const baseArgs = getBaseDaemonArgs(configService, loggerConfigService, bzeroTarget.agentPublicKey);
        const pluginArgs = [
            `-targetId="${bzeroTarget.id}"`,
            `-targetUser="${sshTunnelParameters.targetUser}"`,
            `-identityFile="${sshTunnelParameters.identityFile}"`,
            `-logPath="${loggerConfigService.logPath()}"`,
            `-plugin="ssh"`
        ];

        let args = baseArgs.concat(pluginArgs);

        let cwd = process.cwd();

        // Copy over our executable to a temp file
        let finalDaemonPath = '';
        if (process.env.ZLI_CUSTOM_DAEMON_PATH) {
            // If we set a custom path, we will try to start the daemon from the source code
            cwd = process.env.ZLI_CUSTOM_DAEMON_PATH;
            finalDaemonPath = 'go';
            args = ['run', 'daemon.go'].concat(args);
        } else {
            finalDaemonPath = await copyExecutableToLocalDir(logger, configService.configPath());
        }

        if (sshTunnelParameters.internal) {
            try {
                // FIXME: for now assume we are not debugging, start the go subprocess in the background
                // not sure there's ever a situation where we wouldn't do it this way, but
                // TODO: where do the logs go?
                const options: SpawnOptions = {
                    cwd: cwd,
                    detached: false,
                    shell: true,
                    stdio: 'pipe'
                };

                const daemonProcess = spawn(finalDaemonPath, args, options);

                process.stdin.on('data', async (data) => {
                    daemonProcess.stdin.write(data)
                });

                daemonProcess.stdout.on("data", async (data) => {
                    process.stdout.write(data);
                })

                // FIXME: but is this happening?
                daemonProcess.on('close', async (exitCode) => {
                    if (exitCode !== 0) {
                        logger.error(`Ssh Daemon close event with exit code ${exitCode} -- for more details, see ${loggerConfigService.logPath()}`)
                    }
                    await cleanExit(exitCode, logger);
                });

            } catch (err) {
                logger.error(`Error starting ssh daemon: ${err}`);
                await cleanExit(1, logger);
            }
        } else {
            const sshPath = await getPath(`ssh`);
            const sshCmd = `${sshPath} ${sshTunnelParameters.parsedTarget.user}@${sshTunnelParameters.parsedTarget.name} -i ${sshTunnelParameters.identityFile}`;

            const sshdPath = await getPath('sshd');
            const sshdCmd = `${sshdPath} -d`

            logger.error(sshCmd);
            logger.error(sshdCmd);

            try {
                // FIXME: for now assume we are not debugging, start the go subprocess in the background
                // not sure there's ever a situation where we wouldn't do it this way, but
                const daemonOptions: SpawnOptions = {
                    cwd: cwd,
                    detached: false,
                    shell: true,
                    stdio: 'pipe'
                };

                const sshOptions: SpawnOptions = {
                    cwd: cwd,
                    detached: false,
                    shell: true,
                    stdio: 'pipe'
                };

                const ssh = spawn(sshCmd, [], sshOptions);
                const sshd = spawn(sshdCmd, [], sshOptions);
                const daemon = spawn(finalDaemonPath, args, daemonOptions);

                ssh.stderr.on('data', async (data) => {
                    logger.error(`ssh: ${data}`);
                })
                sshd.stderr.on('data', async (data) => {
                    logger.error(`sshd: ${data}`);
                })

                // pipe my input to sshd's input
                process.stdin.on('data', async (data) => {
                    logger.error(`user -> sshd ${data}`)
                    sshd.stdin.write(data);
                });
                // pipe sshd's output to daemon's input
                sshd.stdout.on('data', async (data) => {
                    logger.error(`sshd -> daemon ${data}`)
                    daemon.stdin.write(data);
                });
                // pipe daemon's output to ssh's input
                daemon.stdout.on('data', async (data) => {
                    logger.error(`daemon -> ssh ${data}`)
                    ssh.stdin.write(data);
                });
                // pipe ssh's output to my output
                ssh.stdout.on('data', async (data) => {
                    logger.error(`ssh -> user ${data}`)
                    process.stdout.write(data);
                });

                // FIXME: but is this happening?
                daemon.on('close', async (exitCode) => {
                    if (exitCode !== 0) {
                        logger.error(`Ssh Daemon close event with exit code ${exitCode} -- for more details, see ${loggerConfigService.logPath()}`);
                    }
                    await cleanExit(exitCode, logger);
                });

            } catch (err) {
                logger.error(`Error starting ssh daemon: ${err}`);
                await cleanExit(1, logger);
            }
        }
    } else {
        throw new Error(`Unhandled target type ${sshTunnelParameters.parsedTarget.type}`);
    }
}

async function getPath(command: string): Promise<string> {
    const pexec = promisify(exec);
    const { stdout } = await pexec(`which ${command}`);
    return stdout.trim();
}

export interface SshTunnelParameters {
    parsedTarget: ParsedTargetString;
    port: number;
    identityFile: string;
    targetUser: string;
    originalHost: string;
    internal: boolean;
}