import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { LoggerConfigService } from 'services/logger/logger-config.service';
import { connectArgs } from 'handlers/connect/connect.command-builder';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { parseTargetString, parseTargetType, parseVerbType } from 'utils/utils';
import yargs from 'yargs';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { shellConnectHandler } from 'handlers/connect/shell-connect.handler';
import { dbConnectHandler } from 'handlers/connect/db-connect.handler';
import { webConnectHandler } from 'handlers/connect/web-connect.handler';
import { startKubeDaemonHandler } from 'handlers/connect/kube-connect.handler';
import { MixpanelService } from 'services/Tracking/mixpanel.service';
import { CreateUniversalConnectionResponse } from 'webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { handleExitCode } from 'utils/daemon-utils';
import { tcpAppConnectHandler } from './tcp-app-connect.handler';
import { AgentType } from 'webshell-common-ts/http/v2/target/types/agent.types';

const IGNORE_TARGET_USER_MSG: string = 'Specifying a target user or role for RDP, SQL Server or Web targets is not supported at this time. Ignoring target name / role and requesting connection per policy.';

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
            targetType: parseTargetType(argv.targetType),
            verbType: parseVerbType(argv.protocol)
        });

        mixpanelService.TrackNewConnection(createUniversalConnectionResponse.targetType);

        switch(createUniversalConnectionResponse.targetType)
        {
        case TargetType.Bzero:
            // At the moment, the only available connections for a Windows agent and a Bzero target type is RDP and SQL Server
            if(createUniversalConnectionResponse.agentType == AgentType.Windows) {
                if (targetUser){
                    logger.warn(IGNORE_TARGET_USER_MSG);
                }
                return await tcpAppConnectHandler(argv, createUniversalConnectionResponse, configService, logger, loggerConfigService);
            } else
                return await callShellConnectHandler(createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.SsmTarget:
        case TargetType.DynamicAccessConfig:
            return await callShellConnectHandler(createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Db:
            return await dbConnectHandler(argv, createUniversalConnectionResponse.splitCert, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Web:
            if (targetUser){
                logger.warn(IGNORE_TARGET_USER_MSG);
            }
            return await webConnectHandler(argv, createUniversalConnectionResponse.targetId, createUniversalConnectionResponse, configService, logger, loggerConfigService);
        case TargetType.Kubernetes:
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

async function callShellConnectHandler(createUniversalConnectionResponse: CreateUniversalConnectionResponse, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
    const exitCode = await shellConnectHandler(createUniversalConnectionResponse.targetType, createUniversalConnectionResponse.targetUser, createUniversalConnectionResponse, configService, logger, loggerConfigService);

    if (exitCode !== 0) {
        const errMsg = handleExitCode(exitCode, createUniversalConnectionResponse);
        if (errMsg.length > 0) {
            logger.error(errMsg);
        }
    }
    return exitCode;
}