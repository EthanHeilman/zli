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
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';

export async function connectHandler(
    argv: yargs.Arguments<connectArgs>,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    mixpanelService: MixpanelService
): Promise<number> {
    const connectionHttpService = new ConnectionHttpService(configService, logger);

    const parsedTarget = parseTargetString(argv.targetString);
    let targetUser = parsedTarget.user;
    if (!targetUser) {
        targetUser = configService.getConnectConfig().targetUser;
    }

    // If they have not passed targetGroups attempt to use the default ones
    // stored in case this is a kube connect
    const kubeGlobalConfig = configService.getGlobalKubeConfig();
    if (argv.targetGroup.length == 0 && kubeGlobalConfig.defaultTargetGroups != null) {
        argv.targetGroup = kubeGlobalConfig.defaultTargetGroups;
    }

    let createUniversalConnectionResponse: CreateUniversalConnectionResponse = undefined;
    try
    {
        createUniversalConnectionResponse = await connectionHttpService.CreateUniversalConnection({
            targetId: parsedTarget.id,
            targetName: parsedTarget.name,
            envId: parsedTarget.envId,
            envName: parsedTarget.envName,
            targetUser: targetUser,
            targetGroups: argv.targetGroup,
            targetType: parseTargetType(argv.targetType)
        });

        logger.warn(`I got it: ${JSON.stringify(createUniversalConnectionResponse)}`);

        mixpanelService.TrackNewConnection(createUniversalConnectionResponse.targetType);

        switch(createUniversalConnectionResponse.targetType)
        {
        case TargetType.SsmTarget:
        case TargetType.Bzero:
        case TargetType.DynamicAccessConfig:
            return await shellConnectHandler(createUniversalConnectionResponse.targetType, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Db:
            // We indicate whether the agent should negotiate a certificate if there is a target user
            if (!createUniversalConnectionResponse.isPasswordless) {
                targetUser = ""
            }
            return await dbConnectHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Web:
            return await webConnectHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Cluster:
            return await startKubeDaemonHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        default:
            logger.error(`Unhandled target type ${createUniversalConnectionResponse.targetType}`);
            return -1;
        }
    }
    catch(err)
    {
        // Close connection if any error occurs in sub-handler
        if (createUniversalConnectionResponse) {
            await connectionHttpService.CloseConnection(createUniversalConnectionResponse.connectionId);
        }

        throw err;
    }
}