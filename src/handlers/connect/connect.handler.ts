import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { connectArgs } from './connect.command-builder';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { parseTargetString, parseTargetType } from '../../utils/utils';
import yargs from 'yargs';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { shellConnectHandler } from './shell-connect.handler';
import { dbConnectHandler } from './db-connect.handler';
import { webConnectHandler } from './web-connect.handler';
import { startKubeDaemonHandler } from './kube-connect.handler';
import { MixpanelService } from '../../services/Tracking/mixpanel.service';
import { cleanExit } from '../clean-exit.handler';

export async function connectHandler(
    argv: yargs.Arguments<connectArgs>,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    mixpanelService: MixpanelService
): Promise<number> {
    const connectionHttpService = new ConnectionHttpService(configService, logger);

    const parsedTarget = parseTargetString(argv.targetString);
    const targetUser = parsedTarget.user;

    // If they have not passed targetGroups attempt to use the default ones
    // stored in case this is a kube connect
    const kubeConfig = configService.getKubeConfig();
    if (argv.targetGroup.length == 0 && kubeConfig.defaultTargetGroups != null) {
        argv.targetGroup = kubeConfig.defaultTargetGroups;
    }

    try
    {
        const createUniversalConnectionResponse = await connectionHttpService.CreateUniversalConnection({
            targetId: parsedTarget.id,
            targetName: parsedTarget.name,
            envId: parsedTarget.envId,
            envName: parsedTarget.envName,
            targetUser: targetUser,
            targetGroups: argv.targetGroup,
            targetType: parseTargetType(argv.targetType)
        });


        mixpanelService.TrackNewConnection(createUniversalConnectionResponse.targetType);

        switch(createUniversalConnectionResponse.targetType)
        {
        case TargetType.SsmTarget:
        case TargetType.Bzero:
        case TargetType.DynamicAccessConfig:
            return shellConnectHandler(createUniversalConnectionResponse.targetType, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Db:
            return dbConnectHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Web:
            return webConnectHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Cluster:
            return startKubeDaemonHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        default:
            logger.error(`Unhandled target type ${createUniversalConnectionResponse.targetType}`);
            return -1;
        }
    }
    catch(err)
    {
        logger.error(err);
        await cleanExit(1, logger);
    }
}