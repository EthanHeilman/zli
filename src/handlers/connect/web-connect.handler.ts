import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import yargs from 'yargs';
import open from 'open';
import { handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getBaseDaemonEnv, getOrDefaultLocalhost, getOrDefaultLocalport, killLocalPortAndPid, spawnDaemonInBackground } from '../../utils/daemon-utils';
import { connectArgs } from './connect.command-builder';
import { WebTargetService } from '../../http-services/web-target/web-target.http-service';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';


export async function webConnectHandler(
    argv: yargs.Arguments<connectArgs>,
    targetId: string,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
): Promise<number>{
    const webTargetService = new WebTargetService(configService, logger);
    const webTarget = await webTargetService.GetWebTarget(targetId);

    // Open up our zli dbConfig
    const webConfig = configService.getWebConfig();

    // Set our local host
    const localHost = getOrDefaultLocalhost(webTarget.localHost);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(webTarget.localPort?.value);
    if (argv.customPort != -1) {
        localPort = argv.customPort;
    }

    // Note: These values will only be saved if we are not running in debug mode
    webConfig.localPort = localPort;
    webConfig.localHost = localHost;
    webConfig.name = webTarget.name;

    await killLocalPortAndPid(webConfig.localPid, webConfig.localPort, logger);

    // Build our runtime config and cwd
    const baseEnv = getBaseDaemonEnv(configService, loggerConfigService, webTarget.agentPublicKey, createUniversalConnectionResponse.connectionId, createUniversalConnectionResponse.connectionAuthDetails);
    const pluginEnv = {
        'LOCAL_PORT': localPort,
        'LOCAL_HOST': localHost,
        'TARGET_ID': webTarget.id,
        'REMOTE_PORT': webTarget.remotePort.value,
        'REMOTE_HOST': webTarget.remoteHost,
        'PLUGIN': 'web'
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
            webConfig.localPid = daemonProcess.pid;
            webConfig.localPort = localPort;
            webConfig.localHost = localHost;

            // Also save the name of the target to display
            webConfig.name = webTarget.name;
            configService.setWebConfig(webConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), webConfig.localPort, webConfig.localHost);

            logger.info(`Started web daemon at ${localHost}:${localPort} for ${webTarget.name}`);

            // Open our browser window
            if(argv.openBrowser) {
                await open(`http://localhost:${localPort}`);
            }

            return 0;
        } else {
            logger.warn(`Started web daemon in debug mode at ${localHost}:${localPort} for ${webTarget.name}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, runtimeConfig, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Web Daemon: ${error}`);
        return 1;
    }
}