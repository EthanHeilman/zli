import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { LoggerConfigService } from 'services/logger/logger-config.service';
import { handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getOrDefaultLocalhost, getOrDefaultLocalport, checkIfPortAvailable, spawnDaemonInBackground, getBaseDaemonEnv } from 'utils/daemon-utils';
import { connectArgs } from 'handlers/connect/connect.command-builder';
import yargs from 'yargs';
import { CreateUniversalConnectionResponse } from 'webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { RDPConfig } from 'services/config/config.service.types';
import { newRDPDaemonManagementService } from 'services/daemon-management/daemon-management.service';
import { ProcessManagerService } from 'services/process-manager/process-manager.service';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';

export const RDP_REMOTE_HOST = 'localhost';
export const RDP_REMOTE_PORT = 3389;


export async function rdpConnectHandler(
    argv: yargs.Arguments<connectArgs>,
    targetId: string,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
): Promise<number> {
    const bzeroTargetService = new BzeroTargetHttpService(configService, logger);
    const bzTarget = await bzeroTargetService.GetBzeroTarget(targetId);

    // Set our local host
    const localHost = getOrDefaultLocalhost(null);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(null);
    if (argv.customPort != -1) {
        localPort = argv.customPort;
    }

    // Check if port is available otherwise exit
    await checkIfPortAvailable(localPort);

    // Build our runtime config and cwd
    const baseEnv = await getBaseDaemonEnv(configService, loggerConfigService, bzTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = {
        'LOCAL_PORT': localPort,
        'LOCAL_HOST': localHost,
        'TARGET_ID': bzTarget.id,
        'REMOTE_PORT': RDP_REMOTE_PORT,
        'REMOTE_HOST': RDP_REMOTE_HOST,
        'PLUGIN': 'db'
    };
    const actionEnv = {
        'DB_ACTION': 'dial',
        'TCP_APP': 'rdp',
    };

    const runtimeConfig = { ...baseEnv, ...pluginEnv, ...actionEnv };

    let cwd = process.cwd();

    // Copy over our executable to a temp file
    const args: string[] = [];
    const finalDaemonPath = await copyExecutableToLocalDir(logger, configService.getConfigPath());

    try {
        if (!argv.debug) {
            // If we are not debugging, start the go subprocess in the background
            const daemonProcess = await spawnDaemonInBackground(logger, loggerConfigService, cwd, finalDaemonPath, args, runtimeConfig, runtimeConfig['CONTROL_PORT'], null);

            // Add to dictionary of rdp daemons
            const rdpConfig: RDPConfig = {
                type: 'rdp',
                name: bzTarget.name,
                localHost: localHost,
                localPort: localPort,
                localPid: daemonProcess.pid,
                controlPort: runtimeConfig['CONTROL_PORT'],
            };

            // Wait for daemon HTTP server to be bound and running
            try {
                await handleServerStart(loggerConfigService.daemonLogPath(), rdpConfig.localPort, rdpConfig.localHost);
            } catch (error) {
                const processManager = new ProcessManagerService();
                await processManager.tryShutDownProcess(rdpConfig.controlPort, rdpConfig.localPid);
                throw error;
            }

            const rdpDaemonManagementService = newRDPDaemonManagementService(configService);
            rdpDaemonManagementService.addDaemon(createUniversalConnectionResponse.connectionId, rdpConfig);

            logger.info(`Started rdp daemon at ${localHost}:${localPort} for ${bzTarget.name}`);

            return 0;
        } else {
            logger.warn(`Started rdp daemon in debug mode at ${localHost}:${localPort} for ${bzTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, runtimeConfig, runtimeConfig['CONTROL_PORT'], args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the RDP Daemon: ${error}`);
        return 1;
    }
    return 0;
}