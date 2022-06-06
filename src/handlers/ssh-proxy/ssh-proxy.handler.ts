import { SemVer, lt, parse } from 'semver';
import { spawn, SpawnOptions } from 'child_process';

import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { SsmTunnelService } from '../../services/ssm-tunnel/ssm-tunnel.service';
import { cleanExit } from '../clean-exit.handler';
import { parseTargetString } from '../../utils/utils';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { copyExecutableToLocalDir, getBaseDaemonArgs } from '../../utils/daemon-utils';
import { sshProxyArg } from './ssh-proxy.command-builder';
import yargs from 'yargs';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';

const minimumAgentVersion = '6.1.0';


export async function sshProxyHandler(
    argv: yargs.Arguments<sshProxyArg>,
    configService: ConfigService,
    logger: Logger,
    keySplittingService: KeySplittingService,
    loggerConfigService: LoggerConfigService
) {
    let prefix = 'bzero-';
    const configName = configService.getConfigName();
    if(configName != 'prod') {
        prefix = `${configName}-${prefix}`;
    }

    if(! argv.host.startsWith(prefix)) {
        this.logger.error(`Invalid host provided: must have form ${prefix}<target>. Target must be either target id or name`);
        await cleanExit(1, this.logger);
    }

    // modify argv to have the targetString and targetType params
    const targetString = argv.user + '@' + argv.host.substr(prefix.length);
    const parsedTarget = parseTargetString(targetString);
    const targetUser = parsedTarget.user;
    if(! targetUser) {
        this.logger.error('No user provided for ssh proxy');
        await cleanExit(1, this.logger);
    }

    if(argv.port < 1 || argv.port > 65535)
    {
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
        targetUser: argv.user
    };

    switch(createUniversalConnectionResponse.targetType)
    {
    case TargetType.SsmTarget:
        return await ssmSshProxyHandler(configService, logger, sshTunnelParameters, createUniversalConnectionResponse, keySplittingService);
    case TargetType.Bzero:
        return await bzeroSshProxyHandler(configService, logger, sshTunnelParameters, createUniversalConnectionResponse, loggerConfigService);
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
 * Launch an SSH tunnel session to a bzero target
 */
async function bzeroSshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, createUniversalConnectionResponse: CreateUniversalConnectionResponse, loggerConfigService: LoggerConfigService) {
    // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
    const agentVersion = parse(createUniversalConnectionResponse.agentVersion);
    if (agentVersion && lt(agentVersion, new SemVer(minimumAgentVersion))) {
        logger.error(`Tunneling to Bzero Target is only supported on agent versions >= ${minimumAgentVersion}. Agent version is ${agentVersion}`);
        return 1;
    }

    // Build our args and cwd
    const baseArgs = getBaseDaemonArgs(configService, loggerConfigService, createUniversalConnectionResponse.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginArgs = [
        `-targetId="${createUniversalConnectionResponse.targetId}"`,
        `-targetUser="${sshTunnelParameters.targetUser}"`,
        `-remoteHost="localhost"`,
        `-remotePort="${sshTunnelParameters.port}"`,
        `-identityFile="${sshTunnelParameters.identityFile}"`,
        `-logPath="${loggerConfigService.daemonLogPath()}"`,
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

    try {
        const options: SpawnOptions = {
            cwd: cwd,
            detached: false,
            shell: true,
            stdio: 'pipe'
        };

        const daemonProcess = spawn(finalDaemonPath, args, options);

        configService.logoutDetected.subscribe(() => {
            logger.error(`\nLogged out by another zli instance. Terminating ssh tunnel\n`);
            daemonProcess.stdin.end();
            process.stdout.end();
        });

        // pass stdio between SSH and the daemon
        process.stdin.on('data', async (data) => {
            daemonProcess.stdin.write(data);
        });
        daemonProcess.stdout.on('data', async (data) => {
            process.stdout.write(data);
        });

        // let daemon know when the session has ended
        process.stdin.on('close', async function () {
            daemonProcess.stdin.end();
        });

        daemonProcess.on('close', async (exitCode) => {
            if (exitCode !== 0) {
                logger.error(`ssh daemon close event with nonzero exit code ${exitCode} -- for more details, see ${loggerConfigService.logPath()}`);
            }
            await cleanExit(exitCode, logger);
        });

    } catch (err) {
        logger.error(`Error starting ssh daemon: ${err}`);
        await cleanExit(1, logger);
    }
}

export interface SshTunnelParameters {
    port: number;
    identityFile: string;
    targetUser: string;
}