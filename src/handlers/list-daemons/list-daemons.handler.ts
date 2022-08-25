import got from 'got/dist/source';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { createTableWithWordWrap, getTableOfKubeStatus, getTableOfWebStatus, toUpperCase } from '../../utils/utils';
import { listDaemonsArgs } from './list-daemons.command-builder';
import yargs from 'yargs';
import { killPortProcess } from '../../utils/daemon-utils';
import chalk from 'chalk';
import isRunning from 'is-running';
import { newDbDaemonManagementService } from '../../services/daemon-management/daemon-management.service';
import { DaemonIsRunningStatus, DaemonQuitUnexpectedlyStatus, DaemonStatus } from '../../services/daemon-management/types/daemon-status.types';
import { ILogger } from '../../../webshell-common-ts/logging/logging.types';
import { DaemonConfig, DaemonConfigType } from '../../services/config/config.service.types';

export async function listDaemonsHandler(
    argv: yargs.Arguments<listDaemonsArgs>,
    configService: ConfigService,
    logger: Logger
) {
    const targetType = argv.targetType;
    if (targetType == 'all' || targetType == 'kube') {
        await kubeStatusHandler(configService, logger);
    }
    if (targetType == 'all' || targetType == 'web') {
        await webStatusHandler(configService, logger);
    }
    if (targetType == 'all' || targetType == 'db') {
        await dbStatusHandler(configService, logger);
    }

    await cleanExit(0, logger);
}

async function webStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const webConfig = configService.getWebConfig();

    if (webConfig['localPid'] == null) {
        // Always ensure nothing is using the localport
        await killPortProcess(webConfig['localPort'], logger);

        logger.warn('No web daemon running');
    } else {
        // Check if the pid is still alive
        if (!isRunning(webConfig['localPid'])) {
            logger.error('The web daemon has quit unexpectedly.');
            webConfig['localPid'] = null;

            // Always ensure nothing is using the localport
            await killPortProcess(webConfig['localPort'], logger);

            configService.setWebConfig(webConfig);
            return;
        }

        logger.info(`Web daemon running:`);
        const tableString = getTableOfWebStatus(webConfig);
        console.log(tableString);
    }
}
interface IDaemonStatusRetriever<T extends DaemonConfig> {
    getAllDaemonStatuses(): Promise<Map<string, DaemonStatus<T>>>;
    configType: DaemonConfigType;
}

async function handleStatus<T extends DaemonConfig>(
    daemonStatusRetriever: IDaemonStatusRetriever<T>,
    tableHeader: string[],
    handleDaemonQuit: (connectionId: string, status: DaemonQuitUnexpectedlyStatus<T>) => Promise<string>,
    handleDaemonRunning: (connectionId: string, status: DaemonIsRunningStatus<T>) => Promise<string[]>,
    logger: ILogger
) {
    const daemonStatuses = await daemonStatusRetriever.getAllDaemonStatuses();

    // Setup rows for table if there are daemons running
    const tableRows: string[][] = [];

    // Process each status result
    for (const [connectionId, result] of daemonStatuses) {
        switch (result.type) {
        case 'daemon_is_running':
            const tableRow = await handleDaemonRunning(connectionId, result);
            tableRows.push(tableRow);
            break;
        case 'daemon_quit_unexpectedly':
            const daemonQuitMsg = await handleDaemonQuit(connectionId, result);
            logger.error(daemonQuitMsg);
            break;
        case 'no_daemon_running':
            // There is nothing special todo here
            break;
        default:
            // Compile-time exhaustive check
            const exhaustiveCheck: never = result;
            throw new Error(`Unhandled case: ${exhaustiveCheck}`);
        }
    }

    const configType = daemonStatusRetriever.configType;
    if (tableRows.length === 0) {
        console.log(chalk.yellow(`No ${configType} daemons running`));
    } else {
        console.log(chalk.magenta(`${toUpperCase(configType)} daemons running:`));
        const tableString = createTableWithWordWrap(tableHeader, tableRows);
        console.log(tableString);
    }
}

async function dbStatusHandler(
    configService: ConfigService,
    logger: Logger
) {

    const dbDaemonManagementService = newDbDaemonManagementService(configService);
    const tableHeader: string[] = ['Connection ID', 'Target Name', 'Local URL'];

    await handleStatus(
        dbDaemonManagementService,
        tableHeader,
        async (connectionId, result) => {
            const connDetails = connectionId ? `${result.config.name} (connId: ${connectionId})` : result.config.name;
            return `The ${dbDaemonManagementService.configType} daemon connected to ${connDetails} has quit unexpectedly.`;
        },
        async (connectionId, result) => {
            return [
                connectionId ? connectionId : 'N/A',
                result.status.targetName,
                result.status.localUrl
            ];
        },
        logger
    );
}

async function kubeStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const kubeConfig = configService.getKubeConfig();

    if (kubeConfig['localPid'] == null) {
        // Always ensure nothing is using the localport
        await killPortProcess(kubeConfig['localPort'], logger);

        logger.warn('No kube daemon running');
    } else {
        // Check if the pid is still alive
        if (!isRunning(kubeConfig['localPid'])) {
            logger.error('The kube daemon has quit unexpectedly.');
            kubeConfig['localPid'] = null;

            // Always ensure nothing is using the localport
            await killPortProcess(kubeConfig['localPort'], logger);

            configService.setKubeConfig(kubeConfig);
            return;
        }

        try {
            const statusResponse: StatusResponse = await got.get(`https://localhost:${kubeConfig['localPort']}/bastionzero-status`, { https: { rejectUnauthorized: false } }).json();
            // Check if there is an exit message to show the user
            if (statusResponse.ExitMessage != '') {
                logger.error(`The Kube Deamon has gotten an exit message from Bastion. Please try logging in again and re-connect with 'zli connect'.\nExit Message: ${statusResponse.ExitMessage}`);
            } else {
                // If there is no exist message, pull the info from the config and show it to the user
                logger.info(`Kube daemon running:`);
                const tableString = getTableOfKubeStatus(kubeConfig);
                console.log(tableString);
            }
        } catch (err) {
            logger.error(`Error contacting Kube Daemon. Please try logging in again and restarting the daemon. Error: ${err}`);
        }
    }
}

interface StatusResponse {
    ExitMessage: string;
}