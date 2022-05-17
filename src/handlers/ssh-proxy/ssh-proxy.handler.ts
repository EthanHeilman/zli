import { includes } from 'lodash';
import { SemVer, lt, parse } from 'semver';

import { spawn, SpawnOptions } from 'child_process';

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
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { copyExecutableToLocalDir, getBaseDaemonArgs } from '../../utils/daemon-utils';

const minimumAgentVersion = '6.1.0';

/**
 * Launch an SSH tunnel session to an SSM target
 */
export async function ssmSshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, keySplittingService: KeySplittingService, envMap: EnvMap) {
    await validateTarget(sshTunnelParameters.parsedTarget, logger);

    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const ssmTarget = await ssmTargetHttpService.GetSsmTarget(sshTunnelParameters.parsedTarget.id);

    if (!ssmTarget.allowedVerbs.map(v => v.type).includes(VerbType.Tunnel)) {
        logger.error('You do not have sufficient permission to open a ssh tunnel to the target');
        await cleanExit(1, logger);
    }

    const allowedTargetUsers = ssmTarget.allowedTargetUsers.map(u => u.userName);
    if (!includes(allowedTargetUsers, sshTunnelParameters.parsedTarget.user)) {
        logger.error(`You do not have permission to tunnel as targetUser: ${sshTunnelParameters.parsedTarget.user}. Current allowed users for you: ${allowedTargetUsers}`);
        await cleanExit(1, logger);
    }

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
}

/**
 * Launch an SSH tunnel session to a bzero target
 */
export async function bzeroSshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, keySplittingService: KeySplittingService, envMap: EnvMap, loggerConfigService: LoggerConfigService) {
    await validateTarget(sshTunnelParameters.parsedTarget, logger);

    const bzeroTargetHttpService = new BzeroTargetHttpService(configService, logger);
    const bzeroTarget = await bzeroTargetHttpService.GetBzeroTarget(sshTunnelParameters.parsedTarget.id);

    if (!bzeroTarget.allowedVerbs.map(v => v.type).includes(VerbType.Tunnel)) {
        logger.error('You do not have sufficient permission to open a ssh tunnel to the target');
        await cleanExit(1, logger);
    }

    const allowedTargetUsers = bzeroTarget.allowedTargetUsers.map(u => u.userName);
    if (!includes(allowedTargetUsers, sshTunnelParameters.parsedTarget.user)) {
        logger.error(`You do not have permission to tunnel as targetUser: ${sshTunnelParameters.parsedTarget.user}. Current allowed users for you: ${allowedTargetUsers}`);
        await cleanExit(1, logger);
    }

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

    try {
        // TODO: use this too?
        /*
        configService.logoutDetected.subscribe(async () => {
            logger.error('\nLogged out by another zli instance. Terminating ssh tunnel\n');
            await cleanExit(0, logger);
        });
        */

        const options: SpawnOptions = {
            cwd: cwd,
            detached: false,
            shell: true,
            stdio: 'pipe'
        };

        const daemonProcess = spawn(finalDaemonPath, args, options);

        process.stdin.on('data', async (data) => {
            daemonProcess.stdin.write(data);
        });
        daemonProcess.stdout.on('data', async (data) => {
            process.stdout.write(data);
        });

        process.stdin.on('close', async function () {
            daemonProcess.stdin.end();
        })

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
    parsedTarget: ParsedTargetString;
    port: number;
    identityFile: string;
    targetUser: string;
}

/**
 * Validates a parsed target string and exits if there is no valid target
 */
async function validateTarget(target: ParsedTargetString, logger: Logger) {
    if (!target) {
        logger.error('No targets matched your targetName/targetId or invalid target string, must follow syntax:');
        logger.error(targetStringExample);
        await cleanExit(1, logger);
    }
}