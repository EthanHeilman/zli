import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getOrDefaultLocalhost, getOrDefaultLocalport, checkIfPortAvailable, spawnDaemonInBackground, getBaseDaemonEnv } from '../../utils/daemon-utils';
import { connectArgs } from './connect.command-builder';
import yargs from 'yargs';
import { DbTargetService } from '../../http-services/db-target/db-target.http-service';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { DbConfig } from '../../services/config/config.service.types';
import { newDbDaemonManagementService } from '../../services/daemon-management/daemon-management.service';


export async function dbConnectHandler(
    argv: yargs.Arguments<connectArgs>,
    targetId: string,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
): Promise<number> {
    const dbTargetService = new DbTargetService(configService, logger);
    const dbTarget = await dbTargetService.GetDbTarget(targetId);

    // Set our local host
    const localHost = getOrDefaultLocalhost(dbTarget.localHost);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(dbTarget.localPort?.value);
    if (argv.customPort != -1) {
        localPort = argv.customPort;
    }

    // Check if port is available otherwise exit
    await checkIfPortAvailable(localPort);

    // Build our runtime config and cwd
    const baseEnv = getBaseDaemonEnv(configService, loggerConfigService, dbTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = {
        'LOCAL_PORT': localPort,
        'LOCAL_HOST': localHost,
        'TARGET_ID': dbTarget.id,
        'REMOTE_PORT': dbTarget.remotePort.value,
        'REMOTE_HOST': dbTarget.remoteHost,
        'PLUGIN': 'db'
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

            // Add to dictionary of db daemons
            const dbConfig: DbConfig = {
                type: 'db',
                name: dbTarget.name,
                localHost: localHost,
                localPort: localPort,
                localPid: daemonProcess.pid
            };
            const dbDaemonManagementService = newDbDaemonManagementService(configService);
            dbDaemonManagementService.addDaemon(createUniversalConnectionResponse.connectionId, dbConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), dbConfig.localPort, dbConfig.localHost);

            logger.info(`Started db daemon at ${localHost}:${localPort} for ${dbTarget.name}`);

            return 0;
        } else {
            logger.warn(`Started db daemon in debug mode at ${localHost}:${localPort} for ${dbTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, runtimeConfig, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Db Daemon: ${error}`);
        return 1;
    }
    return 0;
}