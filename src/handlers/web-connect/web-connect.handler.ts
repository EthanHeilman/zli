import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import yargs from 'yargs';
import open from 'open';
import { webConnectArgs } from './web-connect.command-builder';
import { exit } from 'process';
import { getAppExecPath, isPkgProcess, getAppEntrypoint, startDaemonInDebugMode, copyExecutableToLocalDir } from '../../utils/daemon-utils';
import { WebTargetSummary } from '../../services/virtual-target/virtual-target.types';
import { TargetStatus } from '../../services/common.types';
import { PolicyQueryService } from '../../services/v1/policy-query/policy-query.service';
import { waitUntilUsedOnHost } from 'tcp-port-used';

const { spawn } = require('child_process');
const findPort = require('find-open-port');


export async function webConnectHandler(argv: yargs.Arguments<webConnectArgs>, targetName: string, webTargets: Promise<WebTargetSummary[]>, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
    // First ensure the target is online
    const webTarget = await getWebTargetInfoFromName(await webTargets, targetName, logger);
    if (webTarget.status != TargetStatus.Online) {
        logger.error('Target is offline!');
        await cleanExit(1, logger);
    }

     // Make our API client
     const policyService = new PolicyQueryService(configService, logger);

     // Now check that the user has the correct OPA permissions (we will do this again when the daemon starts)
     const response = await policyService.CheckWebConnect(webTarget.id, webTarget.targetHost, webTarget.targetPort, webTarget.targetHostName);
     if (response.allowed != true) {
         logger.error(`You do not have the correct policy setup to access ${webTarget.targetName}!`);
         await cleanExit(1, logger);
     }

    // Build the refresh command so it works in the case of the pkg'd app which
    // is expecting a second argument set to internal main script
    // This is a work-around for pkg recursive binary issue see https://github.com/vercel/pkg/issues/897
    // https://github.com/vercel/pkg/issues/897#issuecomment-679200552
    const execPath = getAppExecPath();
    const entryPoint = getAppEntrypoint();

    // Open up our zli dbConfig
    const webConfig = configService.getWebConfig();

    // Make sure we have set our local daemon port
    if (webConfig['localPort'] == null) {
        logger.info('First time running web connect, setting local daemon port');
        
        // Generate and set a localport + localhost
        const localPort = await findPort();
        webConfig['localPort'] = localPort;
        webConfig['localHost'] = 'localhost'

        // Save these values so they don't need to be recreated
        configService.setWebConfig(webConfig);
    }

    const localPort = webConfig['localPort'];

    // Golang does not accept "null" as params, so convert them to empty strings or -1
    let port = -1
    let host = ""
    let hostName = ""
    if (webTarget.targetPort != null) {
        port = webTarget.targetPort;
    }
    if (webTarget.targetHost != null) {
        host = webTarget.targetHost;
    }
    if (webTarget.targetHostName != null) {
        hostName = webTarget.targetHostName;
    }

    // Build our args and cwd
    let args = [
        `-sessionId=${configService.sessionId()}`,
        `-daemonPort=${localPort}`,
        `-targetId=${webTarget.id}`,
        `-serviceURL=${configService.serviceUrl().slice(0, -1).replace('https://', '')}`,
        `-authHeader="${configService.getAuthHeader()}"`,
        `-configPath=${configService.configPath()}`,
        `-logPath="${loggerConfigService.daemonLogPath()}"`,
        `-refreshTokenCommand="${execPath + ' ' + entryPoint + ' refresh'}"`,
        `-targetPort=${port}`,
        `-targetHost=${host}`,
        `-targetHostName=${hostName}`,
        `-plugin="web"`
    ];
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
            // TODO: This needs to change so people can have kube + db + web all online 
            const kubeConfig = configService.getKubeConfig();
            kubeConfig['localPid'] = daemonProcess.pid;

            // Wait for daemon HTTP server to be bound and running
            await waitUntilUsedOnHost(localPort, 'localhost', 100, 1000 * 20);

            configService.setKubeConfig(kubeConfig);
            logger.info(`Started web daemon at localhost:${localPort} for ${targetName}`);

            // Open our browser window 
            await open(`http://localhost:${localPort}`);

            await cleanExit(0, logger);
        } else {
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Web Daemon: ${error}`);
        await cleanExit(1, logger);
    }
}

async function getWebTargetInfoFromName(webTargets: WebTargetSummary[], targetName: string, logger: Logger): Promise<WebTargetSummary> {
    for (const webTarget of webTargets) {
        if (webTarget.targetName == targetName) {
            return webTarget;
        }
    }
    logger.error('Unable to find web target!');
    await cleanExit(1, logger);
}