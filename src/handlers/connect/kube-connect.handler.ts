import yargs from 'yargs';
import got from 'got/dist/source';
import { Retrier } from '@jsier/retrier';

import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { connectArgs } from './connect.command-builder';
import { startDaemonInDebugMode, copyExecutableToLocalDir, handleServerStart, getBaseDaemonEnv, spawnDaemonInBackground, checkIfPortAvailable } from '../../utils/daemon-utils';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { findRunningDaemonWithPredicate, newKubeDaemonManagementService } from '../../services/daemon-management/daemon-management.service';
import { KubeConfig } from '../../services/config/config.service.types';
import { buildMapOfNamedKubeEntries, findMatchingKubeContext, generateKubeConfig, getKubeDaemonSecuritySettings, loadUserKubeConfig, updateUserKubeConfigWith } from '../../services/kube-management/kube-management.service';

const findPort = require('find-open-port');

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

    // Check if there is already a daemon running for this target+user
    // combination and exit early if so. We don't want to allow the user to
    // create another connection with same target+user combination because the
    // new connection's context will be the same as the other connection and
    // thus there is a conflict in the user's kube config.
    const kubeDaemonManagementService = newKubeDaemonManagementService(configService);
    const alreadyRunningDaemon = await findRunningDaemonWithPredicate(kubeDaemonManagementService, (d => d.config.targetCluster === clusterTarget.name && d.config.targetUser === targetUser));
    if (alreadyRunningDaemon) {
        // Find matching context name in user's config if possible. Follow
        // similar semantics to stale filtering logic in kube-management.service
        const userKubeConfig = await loadUserKubeConfig();
        logger.debug(`Using user kube config located at: ${userKubeConfig.filePath}`);
        let matchingContextName: string = undefined;
        try {
            const kubeConfigClusters = buildMapOfNamedKubeEntries(userKubeConfig.kubeConfig.clusters);
            const matchingContextEntry = findMatchingKubeContext(configService, userKubeConfig.kubeConfig.contexts, kubeConfigClusters, alreadyRunningDaemon.config);
            if (matchingContextEntry) {
                matchingContextName = matchingContextEntry.name;
            }
        } catch (e) {
            // A fatal error here shouldn't interrupt because finding the
            // context is just for informational purposes
            logger.debug(`Error finding running kube daemon's context: ${e}`);
        }

        let errMsg = 'There is already a kube daemon running for this target and user';
        if (matchingContextName) {
            errMsg += ` with context: ${matchingContextName}`;
        }
        throw new Error(errMsg);
    }

    const kubeSecurityConfig = await getKubeDaemonSecuritySettings(configService, logger);

    // See if the user passed in a custom port
    let daemonPort: number = undefined;
    if (argv.customPort != -1) {
        // Check if specified port is available otherwise exit
        await checkIfPortAvailable(argv.customPort);
        daemonPort = argv.customPort;
    } else {
        // Find available port
        daemonPort = await findPort();
    }

    // Build our runtime config and cwd
    const baseEnv = getBaseDaemonEnv(configService, loggerConfigService, clusterTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = {
        'TARGET_USER': targetUser,
        'TARGET_GROUPS': targetGroups.join(','),
        'TARGET_ID': clusterTarget.id,
        'LOCAL_PORT': daemonPort.toString(),
        'LOCAL_HOST': 'localhost', // Currently kube does not support editing localhost
        'LOCALHOST_TOKEN': kubeSecurityConfig.token,
        'CERT_PATH': kubeSecurityConfig.certPath,
        'KEY_PATH': kubeSecurityConfig.keyPath,
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
        finalDaemonPath = await copyExecutableToLocalDir(logger, configService.getConfigPath());
    }

    try {
        if (!argv.debug) {
            // If we are not debugging, start the go subprocess in the background
            const daemonProcess = await spawnDaemonInBackground(logger, loggerConfigService, cwd, finalDaemonPath, args, runtimeConfig);

            // Generate kube config for this daemon
            const generatedKubeConfig = generateKubeConfig(
                configService,
                clusterTarget.name,
                targetUser,
                daemonPort,
                kubeSecurityConfig.token,
                argv.namespace
            );

            // Update user's kube config
            const userKubeConfigFilePath = await updateUserKubeConfigWith(generatedKubeConfig);

            // Add to dictionary of kube daemons
            const kubeConfig: KubeConfig = {
                type: 'kube',
                targetCluster: clusterTarget.name,
                localHost: 'localhost',
                localPort: daemonPort,
                localPid: daemonProcess.pid,
                targetUser: targetUser,
                targetGroups: targetGroups,
                defaultNamespace: argv.namespace
            };
            kubeDaemonManagementService.addDaemon(createUniversalConnectionResponse.connectionId, kubeConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), daemonPort, kubeConfig.localHost);

            // Poll ready endpoint
            logger.info('Waiting for kube daemon to become ready...');
            await pollDaemonReady(kubeConfig.localPort);
            logger.info(`Started kube daemon at ${kubeConfig.localHost}:${kubeConfig.localPort} for ${targetUser}@${clusterTarget.name}`);
            logger.info(`\nAdding cluster credentials to kubeconfig file found in ${userKubeConfigFilePath}`);
            logger.info(`Setting current-context to ${generatedKubeConfig.contexts[0].name}`);

            return 0;
        } else {
            logger.warn(`Started kube daemon in debug mode at localhost:${daemonPort} for ${targetUser}@${clusterTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, runtimeConfig, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Kube Daemon: ${error}`);
        return 1;
    }
}

function pollDaemonReady(daemonPort: number): Promise<void> {
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