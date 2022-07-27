import { SemVer, lt, parse } from 'semver';
import net from 'net';
import { spawn, SpawnOptions, SpawnOptionsWithStdioTuple, StdioPipe } from 'child_process';

import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { SsmTunnelService } from '../../services/ssm-tunnel/ssm-tunnel.service';
import { cleanExit } from '../clean-exit.handler';
import { parseTargetString } from '../../utils/utils';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { copyExecutableToLocalDir, getBaseDaemonEnv, getOrDefaultLocalport } from '../../utils/daemon-utils';
import { sshProxyArg } from './ssh-proxy.command-builder';
import yargs from 'yargs';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';

const minimumAgentVersion = '6.1.0';
const readyMsg = 'BZERO-DAEMON READY-TO-CONNECT';


export async function sshProxyHandler(
    argv: yargs.Arguments<sshProxyArg>,
    configService: ConfigService,
    logger: Logger,
    keySplittingService: KeySplittingService,
    loggerConfigService: LoggerConfigService
) {
    let prefix = 'bzero-';
    const configName = configService.getConfigName();
    if (configName != 'prod') {
        prefix = `${configName}-${prefix}`;
    }

    if (!argv.host.startsWith(prefix)) {
        this.logger.error(`Invalid host provided: must have form ${prefix}<target>. Target must be either target id or name`);
        await cleanExit(1, this.logger);
    }

    // modify argv to have the targetString and targetType params
    const targetString = argv.user + '@' + argv.host.substr(prefix.length);
    const parsedTarget = parseTargetString(targetString);
    const targetUser = parsedTarget.user;
    if (!targetUser) {
        this.logger.error('No user provided for ssh proxy');
        await cleanExit(1, this.logger);
    }

    if (argv.port < 1 || argv.port > 65535) {
        this.logger.error(`Port ${argv.port} outside of port range [1-65535]`);
        await cleanExit(1, this.logger);
    }

    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const createUniversalConnectionResponse = await connectionHttpService.CreateUniversalSshConnection({
        targetId: parsedTarget.id,
        targetName: parsedTarget.name,
        targetUser: targetUser,
        remoteHost: 'localhost',
        remotePort: argv.port
    });

    const sshTunnelParameters: SshTunnelParameters = {
        port: argv.port,
        identityFile: argv.identityFile,
        targetUser: argv.user,
        hostNames: [parsedTarget.name, argv.host]
    };

    switch (createUniversalConnectionResponse.targetType) {
    case TargetType.SsmTarget:
        return await ssmSshProxyHandler(configService, logger, sshTunnelParameters, createUniversalConnectionResponse, keySplittingService);
    case TargetType.Bzero:
        // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
        const agentVersion = parse(createUniversalConnectionResponse.agentVersion);
        if (agentVersion && lt(agentVersion, new SemVer(minimumAgentVersion))) {
            logger.error(`Tunneling to Bzero Target is only supported on agent versions >= ${minimumAgentVersion}. Agent version is ${agentVersion}`);
            cleanExit(1, logger);
        }

        // if the user has file transfer access but not tunnel access, give them a transparent connection
        if (createUniversalConnectionResponse.sshScpOnly) {
            return await bzeroTransparentSshProxyHandler(configService, logger, sshTunnelParameters, createUniversalConnectionResponse, loggerConfigService);
        } else {
            return await bzeroOpaueSshProxyHandler(configService, logger, sshTunnelParameters, createUniversalConnectionResponse, loggerConfigService);
        }
    default:
        logger.error(`Unhandled ssh target type ${createUniversalConnectionResponse.targetType}`);
        return -1;
    }
}

/**
 * Launch an SSH tunnel session to an SSM target
 */
async function ssmSshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, createUniversalConnectionResponse: CreateUniversalConnectionResponse, keySplittingService: KeySplittingService) {
    const ssmTunnelService = new SsmTunnelService(logger, configService, keySplittingService, true);
    ssmTunnelService.errors.subscribe(async errorMessage => {
        logger.error(errorMessage);
        await cleanExit(1, logger);
    });

    if (await ssmTunnelService.setupWebsocketTunnel(createUniversalConnectionResponse.targetId, sshTunnelParameters.targetUser, sshTunnelParameters.port, sshTunnelParameters.identityFile)) {
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
}

/**
 * Launch an "opaque" SSH tunnel session to a bzero target
 */
async function bzeroOpaueSshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, createUniversalConnectionResponse: CreateUniversalConnectionResponse, loggerConfigService: LoggerConfigService) {
    // Build our runtime config and cwd
    const baseEnv = getBaseDaemonEnv(configService, loggerConfigService, createUniversalConnectionResponse.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = getBaseSshArgs(configService, sshTunnelParameters, createUniversalConnectionResponse);
    const actionEnv = {
        'SSH_ACTION': 'opaque'
    };

    const runtimeConfig: NodeJS.ProcessEnv = { ...baseEnv, ...pluginEnv, ...actionEnv };

    let cwd = process.cwd();

    // Copy over our executable to a temp file
    let finalDaemonPath = '';
    let args: string[] = [];
    if (process.env.ZLI_CUSTOM_DAEMON_PATH) {
        // If we set a custom path, we will try to start the daemon from the source code
        cwd = process.env.ZLI_CUSTOM_DAEMON_PATH;
        finalDaemonPath = 'go';
        args = ['run', 'daemon.go', 'config.go'];
    } else {
        finalDaemonPath = await copyExecutableToLocalDir(logger, configService.configPath());
    }

    try {
        const options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe> = {
            cwd: cwd,
            env: { ...runtimeConfig, ...process.env },
            detached: false,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        };

        const daemonProcess = spawn(finalDaemonPath, args, options);

        configService.logoutDetected.subscribe(() => {
            logger.error(`\nLogged out by another zli instance. Terminating ssh tunnel\n`);
            daemonProcess.stdin.end();
            process.stdout.end();
        });

        // pass stdio between SSH and the daemon
        process.stdin.on('data', (data) => {
            daemonProcess.stdin.write(data);
        });
        daemonProcess.stdout.on('data', (data: any) => {
            process.stdout.write(data);
        });

        // let daemon know when the session has ended
        process.stdin.on('close', function () {
            daemonProcess.stdin.end();
        });

        daemonProcess.on('close', async (exitCode: number) => {
            if (exitCode !== 0) {
                logger.error(`ssh daemon close event with nonzero exit code ${exitCode} -- for more details, see ${loggerConfigService.daemonLogPath()}`);
            }
            await cleanExit(exitCode, logger);
        });

    } catch (err) {
        logger.error(`Error starting ssh daemon: ${err}`);
        await cleanExit(1, logger);
    }
}

/**
 * Launch a "transparent" SSH tunnel session to a bzero target
 *
 * Note that we connect to the daemon differently here than above. In transparent mode, the daemon acts
 *      as an SSH server, and the implementation of that behavior requires a TCP connection instead of stdio
 *      Thus we use stdio as a way for the daemon to communicate with the ZLI directly, and the TCP connection
 *      to carry messages between the daemon and the local SSH process
 */
async function bzeroTransparentSshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, createUniversalConnectionResponse: CreateUniversalConnectionResponse, loggerConfigService: LoggerConfigService) {
    // Build our runtime config and cwd
    const localPort = await getOrDefaultLocalport(null);

    const baseEnv = getBaseDaemonEnv(configService, loggerConfigService, createUniversalConnectionResponse.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = getBaseSshArgs(configService, sshTunnelParameters, createUniversalConnectionResponse);
    const actionEnv = {
        'SSH_ACTION': 'transparent',
        'LOCAL_PORT': localPort.toString()
    };

    const runtimeConfig: NodeJS.ProcessEnv = { ...baseEnv, ...pluginEnv, ...actionEnv };

    let cwd = process.cwd();

    // Copy over our executable to a temp file
    let finalDaemonPath = '';
    let args: string[] = [];
    if (process.env.ZLI_CUSTOM_DAEMON_PATH) {
        // If we set a custom path, we will try to start the daemon from the source code
        cwd = process.env.ZLI_CUSTOM_DAEMON_PATH;
        finalDaemonPath = 'go';
        args = ['run', 'daemon.go', 'config.go'];
    } else {
        finalDaemonPath = await copyExecutableToLocalDir(logger, configService.configPath());
    }

    try {
        const env: NodeJS.ProcessEnv = { ...runtimeConfig, ...process.env };
        const options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe> = {
            cwd: cwd,
            env: env,
            detached: false,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        };

        const daemonProcess = spawn(finalDaemonPath, args, options);

        configService.logoutDetected.subscribe(() => {
            logger.error(`\nLogged out by another zli instance. Terminating ssh tunnel\n`);
            daemonProcess.stdin.end();
            process.stdout.end();
        });

        // pass stdio between SSH and the daemon
        const client = new net.Socket();

        // wait for daemon to tell us it is listening
        daemonProcess.stdout.on('data', (data: any) => {
            if (data == readyMsg) {
                client.connect(localPort, '127.0.0.1');

                process.stdin.on('data', (data) => {
                    client.write(data);
                });

                client.on('data', (data) => {
                    process.stdout.write(data);
                });
            }
        });

        daemonProcess.stderr.on('data', (data: any) => {
            logger.error(`daemon error: ${data}\r\n`);
        });

        // let daemon know when the session has ended
        process.stdin.on('close', function () {
            daemonProcess.stdin.end();
        });

        daemonProcess.on('close', async (exitCode: number) => {
            process.stdout.end();
            if (exitCode !== 0) {
                logger.error(`ssh daemon close event with nonzero exit code ${exitCode} -- for more details, see ${loggerConfigService.daemonLogPath()}`);
            }
            await cleanExit(exitCode, logger);
        });

    } catch (err) {
        logger.error(`Error starting ssh daemon: ${err}`);
        await cleanExit(1, logger);
    }
}

function getBaseSshArgs(configService: ConfigService, sshTunnelParameters: SshTunnelParameters, createUniversalConnectionResponse: CreateUniversalConnectionResponse) {
    return {
        'TARGET_ID': createUniversalConnectionResponse.targetId,
        'TARGET_USER': sshTunnelParameters.targetUser,
        'REMOTE_HOST': 'localhost',
        'REMOTE_PORT': sshTunnelParameters.port.toString(),
        'IDENTITY_FILE': sshTunnelParameters.identityFile,
        'KNOWN_HOSTS_FILE': configService.sshKnownHostsPath(),
        'HOSTNAMES': sshTunnelParameters.hostNames.join(','),
        'PLUGIN': 'ssh',
    };
}

export interface SshTunnelParameters {
    port: number;
    identityFile: string;
    targetUser: string;
    hostNames: string[];
}