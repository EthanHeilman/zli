import yargs from 'yargs';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { disconnectArgs } from 'handlers/disconnect/disconnect.command-builder';
import { newDbDaemonManagementService, newKubeDaemonManagementService } from 'services/daemon-management/daemon-management.service';
import { DisconnectResult } from 'services/daemon-management/types/disconnect-result.types';
import { ILogger } from 'webshell-common-ts/logging/logging.types';
import { DaemonConfig, DaemonConfigType } from 'services/config/config.service.types';
import { filterAndOverwriteUserKubeConfig } from 'services/kube-management/kube-management.service';
import { killDaemonAndLog, logKillDaemonResult } from 'utils/daemon-utils';
import { toUpperCase } from 'utils/utils';

export async function disconnectHandler(
    argv: yargs.Arguments<disconnectArgs>,
    configService: ConfigService,
    logger: Logger
) {

    const targetType = argv.targetType;

    if (targetType == 'all' || targetType == 'kube') {
        const kubeDaemonManagementService = newKubeDaemonManagementService(configService);
        await handleDisconnect(kubeDaemonManagementService, logger);

        // Filter stale bzero entries from user's kube config
        await filterAndOverwriteUserKubeConfig(configService, logger);
    }
    if (targetType == 'all' || targetType == 'web') {
        // Ensure nothing is using that localpid
        const webConfig = configService.getWebConfig();

        if (webConfig['localPid'] != null) {
            await killDaemonAndLog(webConfig, logger);

            // Update the localPid
            webConfig['localPid'] = null;
            configService.setWebConfig(webConfig);
            logger.info('Killed local web daemon!');
        } else {
            logger.warn('No web daemon running');
        }
    }
    if (targetType == 'all' || targetType == 'db') {
        const dbDaemonManagementService = newDbDaemonManagementService(configService);
        await handleDisconnect(dbDaemonManagementService, logger);
    }
}

export interface IDaemonDisconnector<T extends DaemonConfig> {
    disconnectAllDaemons(): Promise<Map<string, DisconnectResult<T>>>;
    configType: DaemonConfigType;
}

export async function handleDisconnect<T extends DaemonConfig>(
    daemonDisconnector: IDaemonDisconnector<T>,
    logger: ILogger
) {
    logger.info(`Waiting for all ${daemonDisconnector.configType} daemons to shut down...`);
    const disconnectResults = await daemonDisconnector.disconnectAllDaemons();

    // Process each disconnect result
    let didDisconnect: boolean = false;
    for (const [connectionId, disconnectResult] of disconnectResults) {
        const localPid = disconnectResult.daemon.localPid;
        switch (disconnectResult.type) {
        case 'daemon_fail_killed':
            logger.warn(`Attempt to shut down the daemon running on PID ${localPid} failed: ${disconnectResult.error}\nConsider running \'kill -9 ${localPid}\' to force kill it`);
            break;
        case 'daemon_success_killed':
            didDisconnect = disconnectResult.killResult !== 'no_longer_exists';
            const id = `${toUpperCase(disconnectResult.daemon.type)} daemon (connId: ${connectionId ? connectionId : 'N/A'} - PID: ${localPid})`;
            logKillDaemonResult(id, disconnectResult.killResult, logger);
            break;
        case 'daemon_pid_not_set':
            // Nothing to log because we can't attempt to shut down a daemon
            // process whose PID is unknown
            break;
        default:
            // Compile-time exhaustive check
            const exhaustiveCheck: never = disconnectResult;
            throw new Error(`Unhandled case: ${exhaustiveCheck}`);
        }
    }

    if (!didDisconnect) {
        logger.warn(`No ${daemonDisconnector.configType} daemons running`);
    }
}