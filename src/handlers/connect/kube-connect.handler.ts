import yargs from 'yargs';
import got from 'got/dist/source';
import { Retrier } from '@jsier/retrier';

import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { connectArgs } from './connect.command-builder';
import { startDaemonInDebugMode, copyExecutableToLocalDir, handleServerStart, getBaseDaemonEnv, killLocalPortAndPid, spawnDaemonInBackground } from '../../utils/daemon-utils';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';


export async function startKubeDaemonHandler(
    argv: yargs.Arguments<connectArgs>,
    targetId: string,
    targetUser: string,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
): Promise<number> {
    const targetGroups = argv.targetGroup;
    const kubeService = new KubeHttpService(configService, logger);
    const clusterTarget = await kubeService.GetKubeCluster(targetId);

    // Open up our zli kubeConfig
    const kubeConfig = configService.getKubeConfig();

    // Make sure the user has created a kubeConfig before
    if (kubeConfig.keyPath == null) {
        logger.error('Please make sure you have created your kubeconfig before running connect. You can do this via "zli generate kubeConfig"');
        return 1;
    }

    // Check if we've already started a process
    await killLocalPortAndPid(kubeConfig.localPid, kubeConfig.localPort, logger);

    // See if the user passed in a custom port
    let daemonPort = kubeConfig.localPort.toString();
    if (argv.customPort != -1) {
        daemonPort = argv.customPort.toString();
    }

    // Build our runtime config and cwd
    const baseEnv = getBaseDaemonEnv(configService, loggerConfigService, clusterTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = {
        'TARGET_USER': targetUser,
        'TARGET_GROUPS': targetGroups.join(','),
        'TARGET_ID': clusterTarget.id,
        'LOCAL_PORT': daemonPort,
        'LOCAL_HOST': 'localhost', // Currently kube does not support editing localhost
        'LOCALHOST_TOKEN': kubeConfig.token,
        'CERT_PATH': kubeConfig.certPath,
        'KEY_PATH': kubeConfig.keyPath,
        'PLUGIN': 'kube',
    };
    const runtimeConfig = { ...baseEnv, ...pluginEnv };

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
        if (!argv.debug) {
            // If we are not debugging, start the go subprocess in the background
            const daemonProcess = await spawnDaemonInBackground(logger, loggerConfigService, cwd, finalDaemonPath, args, runtimeConfig);
            // Now save the Pid so we can kill the process next time we start it
            kubeConfig.localPid = daemonProcess.pid;

            // Save the info about target user and group
            kubeConfig.targetUser = targetUser;
            kubeConfig.targetGroups = targetGroups;
            kubeConfig.targetCluster = clusterTarget.name;
            configService.setKubeConfig(kubeConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), parseInt(daemonPort), kubeConfig.localHost);

            // Poll ready endpoint
            logger.info('Waiting for kube daemon to become ready...');
            await pollDaemonReady(kubeConfig.localPort);
            logger.info(`Started kube daemon at ${kubeConfig.localHost}:${kubeConfig.localPort} for ${targetUser}@${clusterTarget.name}`);
            return 0;
        } else {
            logger.warn(`Started kube daemon in debug mode at ${kubeConfig.localHost}:${kubeConfig.localPort} for ${targetUser}@${clusterTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, runtimeConfig, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Kube Daemon: ${error}`);
        return 1;
    }
}

function pollDaemonReady(daemonPort: number) : Promise<void> {
    // 1 minutes
    const retrier = new Retrier({
        limit: 60,
        delay: 1000 * 1,
    });

    return retrier.resolve(async () => {
        const isDaemonReadyResp = await got.get(`https://localhost:${daemonPort}/bastionzero-ready`, { throwHttpErrors: false, https: { rejectUnauthorized: false } });

        if (isDaemonReadyResp.statusCode === 200) {
            return;
        } else {
            throw new Error('Daemon took too long to become ready');
        }
    });
}