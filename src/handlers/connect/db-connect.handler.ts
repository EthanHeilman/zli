import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import {  handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getBaseDaemonArgs, getOrDefaultLocalhost, getOrDefaultLocalport, killLocalPortAndPid } from '../../utils/daemon-utils';
import { connectArgs } from './connect.command-builder';
import yargs from 'yargs';
import { DbTargetHttpService } from '../../http-services/db-target/db-target.http-service';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';

const { spawn } = require('child_process');


export async function dbConnectHandler(
    argv: yargs.Arguments<connectArgs>,
    targetId: string,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
): Promise<number> {
    const dbTargetService = new DbTargetHttpService(configService, logger);
    const dbTarget = await dbTargetService.GetDbTarget(targetId);

    // Open up our zli dbConfig
    const dbConfig = configService.getDbConfig();

    // Set our local host
    const localHost = getOrDefaultLocalhost(dbTarget.localHost);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(dbTarget.localPort?.value);
    if (argv.customPort != -1) {
        localPort = argv.customPort;
    }

    // Note: These values will only be saved if we are not running in debug mode
    dbConfig.localPort = localPort;
    dbConfig.localHost = localHost;
    dbConfig.name = dbTarget.name;

    await killLocalPortAndPid(dbConfig.localPid, dbConfig.localPort, logger);

    // Build our args and cwd
    const baseArgs = getBaseDaemonArgs(configService, loggerConfigService, dbTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginArgs = [
        `-localPort=${localPort}`,
        `-localHost=${localHost}`,
        `-targetId=${dbTarget.id}`,
        `-remotePort=${dbTarget.remotePort.value}`,
        `-remoteHost=${dbTarget.remoteHost}`,
        `-plugin="db"`
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
        if (!argv.debug) {
            // If we are not debugging, start the go subprocess in the background
            const options = {
                cwd: cwd,
                detached: true,
                shell: true,
                stdio: ['ignore', 'ignore', 'ignore']
            };

            const daemonProcess = await spawn(finalDaemonPath, args, options);

            // Now save the Pid so we can kill the process next time we start it
            dbConfig.localPid = daemonProcess.pid;
            configService.setDbConfig(dbConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), dbConfig.localPort, dbConfig.localHost);

            logger.info(`Started db daemon at ${localHost}:${localPort} for ${dbTarget.name}`);

            return 0;
        } else {
            logger.warn(`Started db daemon in debug mode at ${localHost}:${localPort} for ${dbTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Db Daemon: ${error}`);
        return 1;
    }
    return 0;
}