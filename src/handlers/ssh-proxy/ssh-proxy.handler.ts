import { identity, includes } from 'lodash';
import { SemVer, lt, parse } from 'semver';
import crypto from 'crypto';
import fs from 'fs';
import { spawn, SpawnOptions } from 'child_process';
import util from 'util';
import SshPK from 'sshpk';

import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { SsmTunnelService } from '../../services/ssm-tunnel/ssm-tunnel.service';
import { cleanExit } from '../clean-exit.handler';
import { connectCheckAllowedTargetUsers, targetStringExample } from '../../utils/utils';
import { ParsedTargetString } from '../../services/common.types';
import { EnvMap } from '../../cli-driver';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { BzeroAgentSummary } from '../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { getCliSpace } from '../../utils/shell-utils';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { copyExecutableToLocalDir, getBaseDaemonArgs } from '../../utils/daemon-utils';


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
        if (agentVersion && lt(agentVersion, new SemVer('5.2.0'))) {
            // FIXME: revisit this, given pipelining version
            logger.error(`Tunneling to Bzero Target is only supported on agent versions >= 5.2.0. Agent version is ${agentVersion}`);
            return 1;
        }

        await setupEphemeralSshKey(configService, sshTunnelParameters.identityFile);
        const pubKey = await extractPubKeyFromIdentityFile(sshTunnelParameters.identityFile);
        const [keyType, sshPubKey] = pubKey.toString('ssh').split(' ');

        // Build our args and cwd
        const baseArgs = getBaseDaemonArgs(configService, loggerConfigService, bzeroTarget.agentPublicKey);
        let pluginArgs = [
            `-targetId="${bzeroTarget.id}"`,
            `-targetUser="${sshTunnelParameters.targetUser}"`,
            `-identityFile="${sshTunnelParameters.identityFile}"`,
            `-publicKey="${sshPubKey}"`,
            `-logPath="/Users/johncmerfeld/work/code/zli/logs"`,
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
            // FIXME: for now assume we are not debugging, start the go subprocess in the background
            const options: SpawnOptions = {
                cwd: cwd,
                detached: false,
                shell: true,
                stdio: 'pipe'
            };

            const daemonProcess = spawn(finalDaemonPath, args, options);

            daemonProcess.stdin.pipe(process.stdin);
            daemonProcess.stdout.pipe(process.stdout);
            /*
            process.stdin.on('data', async (data) => {
                daemonProcess.stdin.write(data)
            });
            
            // this definitely works
            daemonProcess.stdout.on("data", async (data) => {
                process.stdout.write(data);
                //logger.error(`${data}`);
                //cleanExit(100, logger);
            })
            */


            daemonProcess.on('close', async (exitCode) => {
                logger.debug(`Ssh Daemon close event with exit code ${exitCode}`);
                await cleanExit(exitCode, logger);
            });

        } catch (err) {
            logger.error(`Error starting ssh daemon: ${err}`);
            await cleanExit(1, logger);
        }
    } else {
        throw new Error(`Unhandled target type ${sshTunnelParameters.parsedTarget.type}`);
    }
}


async function setupEphemeralSshKey(configService: ConfigService, identityFile: string): Promise<void> {
    const bzeroSshKeyPath = configService.sshKeyPath();

    // Generate a new ssh key for each new tunnel as long as the identity
    // file provided is managed by bzero
    // TODO #39: Change the lifetime of this key?
    if (identityFile === bzeroSshKeyPath) {
        const privateKey = await generateEphemeralSshKey();
        await util.promisify(fs.writeFile)(bzeroSshKeyPath, privateKey, {
            mode: '0600'
        });
    }
}

async function generateEphemeralSshKey(): Promise<string> {

    const { privateKey } = await util.promisify(crypto.generateKeyPair)('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs1',
            format: 'pem'
        }
    });

    return privateKey;
}

async function extractPubKeyFromIdentityFile(identityFileName: string): Promise<SshPK.Key> {
    const identityFile = await readIdentityFile(identityFileName);

    // Use ssh-pk library to convert the public key to ssh RFC 4716 format
    // https://stackoverflow.com/a/54406021/9186330
    // https://github.com/joyent/node-sshpk/blob/4342c21c2e0d3860f5268fd6fd8af6bdeddcc6fc/lib/key.js#L234
    return SshPK.parseKey(identityFile, 'auto');
}

async function readIdentityFile(identityFileName: string): Promise<string> {
    return util.promisify(fs.readFile)(identityFileName, 'utf8');
}

export interface SshTunnelParameters {
    parsedTarget: ParsedTargetString;
    port: number;
    identityFile: string;
    targetUser: string;
}