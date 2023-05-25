import fs from 'fs';
import { DbConfig, KubeConfig, WebConfig } from 'services/config/config.service.types';
import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import { ILogger } from 'webshell-common-ts/logging/logging.types';
import { handleDisconnect, IDaemonDisconnector } from 'handlers/disconnect/disconnect.handler';
import { newDbDaemonManagementService, newKubeDaemonManagementService } from 'services/daemon-management/daemon-management.service';
import { shutDownDaemonAndLog } from 'utils/daemon-utils';

export async function logoutHandler(
    configService: ConfigService,
    logger: Logger
) {
    // Stitch together dependencies for handleLogout
    const dbDaemonManagementService = newDbDaemonManagementService(configService);
    const kubeDaemonManagementService = newKubeDaemonManagementService(configService);
    const fileRemover: IFileRemover = {
        removeFileIfExists: (filePath: string) => fs.rmSync(filePath, {force:true})
    };

    await handleLogout(
        configService,
        dbDaemonManagementService,
        kubeDaemonManagementService,
        fileRemover,
        logger
    );
}

export interface ILogoutConfigService {
    logout(): void;
    clearSessionId(): void;
    getSshKeyPath(): string;
    getSshKnownHostsPath(): string;

    // TODO: CWC-2030 These functions can be removed from the interface once web
    //migrates to the DaemonManagementService to handle disconnects
    getWebConfig(): WebConfig;
    setWebConfig(config: WebConfig): void;
}

export interface IFileRemover {
    removeFileIfExists(filePath: string): void;
}

export async function handleLogout(
    configService: ILogoutConfigService,
    dbDaemonDisconnector: IDaemonDisconnector<DbConfig>,
    kubeDaemonDisconnector: IDaemonDisconnector<KubeConfig>,
    fileRemover: IFileRemover,
    logger: ILogger
) {
    // Deletes the auth tokens from the config which will force the
    // user to login again before running another command
    logger.info('Closing any existing SSH tunnels and shell connections');
    configService.logout();
    configService.clearSessionId();
    logger.info('Clearing temporary SSH files');
    fileRemover.removeFileIfExists(configService.getSshKeyPath());
    fileRemover.removeFileIfExists(configService.getSshKnownHostsPath());

    // Close any daemon connections, start with kube
    logger.info('Closing any existing Kube Connections');
    await handleDisconnect(kubeDaemonDisconnector, logger);

    // Then db
    logger.info('Closing any existing Db Connections');
    await handleDisconnect(dbDaemonDisconnector, logger);

    // Then web
    logger.info('Closing any existing Web Connections');
    const webConfig = configService.getWebConfig();
    await shutDownDaemonAndLog(webConfig, logger);

    // Update the localPid
    webConfig['localPid'] = null;
    configService.setWebConfig(webConfig);

    logger.info('Logout successful');
}