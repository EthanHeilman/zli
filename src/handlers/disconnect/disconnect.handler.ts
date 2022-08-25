import { killDaemon } from '../../utils/daemon-utils';
import yargs from 'yargs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { disconnectArgs } from './disconnect.command-builder';
import { newDbDaemonManagementService } from '../../services/daemon-management/daemon-management.service';
import { DisconnectResult } from '../../services/daemon-management/types/disconnect-result.types';
import { ILogger } from '../../../webshell-common-ts/logging/logging.types';
import { DaemonConfig, DaemonConfigType } from '../../services/config/config.service.types';

export async function disconnectHandler(
    argv: yargs.Arguments<disconnectArgs>,
    configService: ConfigService,
    logger: Logger
) {

    const targetType = argv.targetType;

    if (targetType == 'all' || targetType == 'kube') {
        // Ensure nothing is using that localpid
        const kubeConfig = configService.getKubeConfig();

        if (kubeConfig['localPid'] != null) {
            await killDaemon(kubeConfig['localPid'], logger);

            // Update the localPid
            kubeConfig['localPid'] = null;
            configService.setKubeConfig(kubeConfig);
            logger.info('Killed local kube daemon!');
        } else {
            logger.warn('No kube daemon running');
        }
    }
    if (targetType == 'all' || targetType == 'web') {
        // Ensure nothing is using that localpid
        const webConfig = configService.getWebConfig();

        if (webConfig['localPid'] != null) {
            await killDaemon(webConfig['localPid'], logger);

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
    await cleanExit(0, logger);
}

export interface IDaemonDisconnector {
    disconnectAllDaemons(): Promise<Map<string, DisconnectResult<DaemonConfig>>>;
    configType: DaemonConfigType;
}

export async function handleDisconnect(
    daemonDisconnector: IDaemonDisconnector,
    logger: ILogger
) {
    const disconnectResults = await daemonDisconnector.disconnectAllDaemons();

    // Process each disconnect result
    let didDisconnect: boolean = false;
    for (const [connectionId, result] of disconnectResults) {
        const localPid = result.daemon.localPid;
        switch (result.type) {
        case 'daemon_fail_killed':
            logger.warn(`Attempt to kill existing daemon failed. This is expected if the daemon has been killed already. Make sure no program is using pid: ${localPid}. Try running \`kill -9 ${localPid}\``);
            logger.debug(`Error killing daemon process: ${result.error}`);
            break;
        case 'daemon_success_killed':
            didDisconnect = true;
            const connId = connectionId ? connectionId : 'N/A';
            logger.info(`Killed local ${result.daemon.type} daemon: (connId: ${connId} - localPid: ${localPid})!`);
            break;
        default:
            // Compile-time exhaustive check
            const exhaustiveCheck: never = result;
            throw new Error(`Unhandled case: ${exhaustiveCheck}`);
        }
    }

    if (!didDisconnect) {
        logger.warn(`No ${daemonDisconnector.configType} daemons running`);
    }
}