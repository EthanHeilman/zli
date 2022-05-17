import { killDaemon } from '../utils/daemon-utils';
import { removeIfExists } from '../utils/utils';
import { ConfigService } from '../services/config/config.service';
import { Logger } from '../services/logger/logger.service';
import { cleanExit } from './clean-exit.handler';


export async function logoutHandler(configService: ConfigService, logger: Logger) {
    // Deletes the auth tokens from the config which will force the
    // user to login again before running another command
    configService.logout();
    configService.deleteSessionId();
    logger.info('Closing any existing SSH Tunnel Connections');
    // FIXME: why do we log this? Doesn't seem like it's happening
    logger.info('Clearing temporary SSH identity file');
    removeIfExists(configService.sshKeyPath());

    // Close any daemon connections, start with kube
    logger.info('Closing any existing Kube Connections');
    const kubeConfig = configService.getKubeConfig();
    killDaemon(kubeConfig['localPid'], logger);

    // Update the localPid
    kubeConfig['localPid'] = null;
    configService.setKubeConfig(kubeConfig);

    // Then db
    logger.info('Closing any existing Db Connections');
    const dbConfig = configService.getDbConfig();
    killDaemon(dbConfig['localPid'], logger);

    // Update the localPid
    dbConfig['localPid'] = null;
    configService.setDbConfig(dbConfig);

    // Then web
    logger.info('Closing any existing Web Connections');
    const webConfig = configService.getWebConfig();
    killDaemon(webConfig['localPid'], logger);

    // Update the localPid
    webConfig['localPid'] = null;
    configService.setWebConfig(webConfig);

    logger.info('Logout successful');
    await cleanExit(0, logger);
}