import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { LoggerConfigService } from 'services/logger/logger-config.service';
import { handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getOrDefaultLocalhost, getOrDefaultLocalport, checkIfPortAvailable, spawnDaemonInBackground, getBaseDaemonEnv } from 'utils/daemon-utils';
import { connectArgs } from 'handlers/connect/connect.command-builder';
import yargs from 'yargs';
import { CreateUniversalConnectionResponse } from 'webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { RDPConfig, SQLServerConfig } from 'services/config/config.service.types';
import { newRDPDaemonManagementService, newSQLServerDaemonManagementService } from 'services/daemon-management/daemon-management.service';
import { ProcessManagerService } from 'services/process-manager/process-manager.service';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';

export const RDP_REMOTE_HOST = 'localhost';
export const RDP_REMOTE_PORT = 3389;

export const SQL_SERVER_REMOTE_HOST = 'localhost';
export const SQL_SERVER_REMOTE_PORT = 1433;


export async function tcpAppConnectHandler(
    argv: yargs.Arguments<connectArgs>,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
): Promise<number> {

    let remotePort;
    let remoteHost;
    let tcpApp;

    // If there is a port that has been used before for this target, use that again
    const tcpAppPortsConfig = configService.getTcpAppPortsConfig();
    const currentTargetTcpAppPortsConfig = tcpAppPortsConfig[createUniversalConnectionResponse.targetId];
    let defaultPort: number = null;

    switch (createUniversalConnectionResponse.verbType)
    {
    case VerbType.RDP:
        remotePort = RDP_REMOTE_PORT;
        remoteHost = RDP_REMOTE_HOST;
        tcpApp = 'rdp';
        if(currentTargetTcpAppPortsConfig && currentTargetTcpAppPortsConfig.rdpPort)
            defaultPort = currentTargetTcpAppPortsConfig.rdpPort;
        break;
    case VerbType.SQLServer:
        remotePort = SQL_SERVER_REMOTE_PORT;
        remoteHost = SQL_SERVER_REMOTE_HOST;
        tcpApp = 'sqlserver';
        if(currentTargetTcpAppPortsConfig && currentTargetTcpAppPortsConfig.sqlServerPort)
            defaultPort = currentTargetTcpAppPortsConfig.sqlServerPort;
        break;
    default:
        logger.error(`Protocol ${createUniversalConnectionResponse.verbType} is not supported on BastionZero Windows Agents.`);
        await cleanExit(1, logger);
    }

    const bzeroTargetService = new BzeroTargetHttpService(configService, logger);
    const bzTarget = await bzeroTargetService.GetBzeroTarget(createUniversalConnectionResponse.targetId);

    // Set our local host
    const localHost = getOrDefaultLocalhost(null);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(defaultPort);
    // If a local port hasn't been assigned to this target yet, assign a new one
    if(localPort != defaultPort){
        switch (createUniversalConnectionResponse.verbType)
        {
        case VerbType.RDP:
            tcpAppPortsConfig[createUniversalConnectionResponse.targetId] = {...tcpAppPortsConfig[createUniversalConnectionResponse.targetId], ...{rdpPort: localPort}};
            break;
        case VerbType.SQLServer:
            tcpAppPortsConfig[createUniversalConnectionResponse.targetId] = {...tcpAppPortsConfig[createUniversalConnectionResponse.targetId], ...{sqlServerPort: localPort}};
            break;
        default:
            logger.error(`Protocol ${createUniversalConnectionResponse.verbType} is not supported on BastionZero Windows Agents.`);
            await cleanExit(1, logger);
        }
        configService.setTcpAppPortsConfig(tcpAppPortsConfig);
        logger.debug(`Successfully changed ${createUniversalConnectionResponse.verbType} localport for target ${createUniversalConnectionResponse.targetId} from ${defaultPort} to ${localPort} `);
    }

    if (argv.customPort != -1)
        localPort = argv.customPort;

    // Check if port is available otherwise exit
    await checkIfPortAvailable(localPort);

    // Build our runtime config and cwd
    const baseEnv = await getBaseDaemonEnv(configService, loggerConfigService, bzTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = {
        'LOCAL_PORT': localPort,
        'LOCAL_HOST': localHost,
        'TARGET_ID': bzTarget.id,
        'REMOTE_PORT': remotePort,
        'REMOTE_HOST': remoteHost,
        'PLUGIN': 'db'
    };
    const actionEnv = {
        'DB_ACTION': 'dial',
        'TCP_APP': tcpApp,
    };

    const runtimeConfig = { ...baseEnv, ...pluginEnv, ...actionEnv };

    const cwd = process.cwd();

    // Copy over our executable to a temp file
    const args: string[] = [];
    const finalDaemonPath = await copyExecutableToLocalDir(logger, configService.getConfigPath());

    try {
        if (!argv.debug) {
            // If we are not debugging, start the go subprocess in the background
            const daemonProcess = await spawnDaemonInBackground(logger, loggerConfigService, cwd, finalDaemonPath, args, runtimeConfig, runtimeConfig['CONTROL_PORT'], null);

            // Wait for daemon HTTP server to be bound and running
            try {
                await handleServerStart(loggerConfigService.daemonLogPath(), localPort, localHost);
            } catch (error) {
                const processManager = new ProcessManagerService();
                await processManager.tryShutDownProcess(runtimeConfig['CONTROL_PORT'], daemonProcess.pid);
                throw error;
            }

            // Add to dictionary of tcp app daemons
            let rdpConfig: RDPConfig;
            let sqlServerConfig: SQLServerConfig;
            switch (createUniversalConnectionResponse.verbType)
            {
            case VerbType.RDP:
                rdpConfig = {
                    type: 'rdp',
                    name: bzTarget.name,
                    localHost: localHost,
                    localPort: localPort,
                    localPid: daemonProcess.pid,
                    controlPort: runtimeConfig['CONTROL_PORT'],
                };
                const rdpDaemonManagementService = newRDPDaemonManagementService(configService);
                rdpDaemonManagementService.addDaemon(createUniversalConnectionResponse.connectionId, rdpConfig);
                break;
            case VerbType.SQLServer:
                sqlServerConfig = {
                    type: 'sqlserver',
                    name: bzTarget.name,
                    localHost: localHost,
                    localPort: localPort,
                    localPid: daemonProcess.pid,
                    controlPort: runtimeConfig['CONTROL_PORT'],
                };
                const sqlServerDaemonManagementService = newSQLServerDaemonManagementService(configService);
                sqlServerDaemonManagementService.addDaemon(createUniversalConnectionResponse.connectionId, sqlServerConfig);
                break;
            }

            logger.info(`Started ${createUniversalConnectionResponse.verbType} daemon at ${localHost}:${localPort} for ${bzTarget.name}`);

            return 0;
        } else {
            logger.warn(`Started ${createUniversalConnectionResponse.verbType} daemon in debug mode at ${localHost}:${localPort} for ${bzTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, runtimeConfig, runtimeConfig['CONTROL_PORT'], args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the ${createUniversalConnectionResponse.verbType} Daemon: ${error}`);
        return 1;
    }
    return 0;
}