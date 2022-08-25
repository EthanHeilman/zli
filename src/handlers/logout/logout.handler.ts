import { killDaemon } from '../../utils/daemon-utils';
import { cleanExit } from '../clean-exit.handler';
import { KubeConfig, WebConfig } from '../../services/config/config.service.types';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { removeIfExists } from '../../utils/utils';
import { ILogger } from '../../../webshell-common-ts/logging/logging.types';
import { handleDisconnect, IDaemonDisconnector } from '../disconnect/disconnect.handler';
import { newDbDaemonManagementService } from '../../services/daemon-management/daemon-management.service';

export async function logoutHandler(
    configService: ConfigService,
    logger: Logger
) {
    // Stitch together dependencies for handleLogout
    const dbDaemonManagementService = newDbDaemonManagementService(configService);
    const fileRemover: IFileRemover = {
        removeFileIfExists: (filePath: string) => removeIfExists(filePath)
    };

    await handleLogout(configService, dbDaemonManagementService, fileRemover, logger);
    await cleanExit(0, logger);
}

export interface ILogoutConfigService {
    logout(): void;
    deleteSessionId(): void;
    sshKeyPath(): string;
    sshKnownHostsPath(): string;

    // TODO: CWC-2030 These functions can be removed from the interface once
    // kube+web migrate to the DaemonManagementService to handle disconnects
    getKubeConfig(): KubeConfig;
    setKubeConfig(config: KubeConfig): void;
    getWebConfig(): WebConfig;
    setWebConfig(config: WebConfig): void;
}

export interface IFileRemover {
    removeFileIfExists(filePath: string): void;
}

export async function handleLogout(
    configService: ILogoutConfigService,
    dbDaemonDisconnector: IDaemonDisconnector,
    fileRemover: IFileRemover,
    logger: ILogger
) {
    // Deletes the auth tokens from the config which will force the
    // user to login again before running another command
    configService.logout();
    configService.deleteSessionId();
    logger.info('Closing any existing SSH Tunnel Connections');
    logger.info('Clearing temporary SSH files');
    fileRemover.removeFileIfExists(configService.sshKeyPath());
    fileRemover.removeFileIfExists(configService.sshKnownHostsPath());

    // Close any daemon connections, start with kube
    logger.info('Closing any existing Kube Connections');
    const kubeConfig = configService.getKubeConfig();
    killDaemon(kubeConfig['localPid'], logger);

    // Update the localPid
    kubeConfig['localPid'] = null;
    configService.setKubeConfig(kubeConfig);

    // Then db
    logger.info('Closing any existing Db Connections');
    await handleDisconnect(dbDaemonDisconnector, logger);

    // Then web
    logger.info('Closing any existing Web Connections');
    const webConfig = configService.getWebConfig();
    killDaemon(webConfig['localPid'], logger);

    // Update the localPid
    webConfig['localPid'] = null;
    configService.setWebConfig(webConfig);

    logger.info('Logout successful');
}