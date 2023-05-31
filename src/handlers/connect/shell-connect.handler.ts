import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { SemVer, lt, parse } from 'semver';

import { createAndRunShell, startShellDaemon } from 'utils/shell-utils';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { LoggerConfigService } from 'services/logger/logger-config.service';
import { ConnectionState } from 'webshell-common-ts/http/v2/connection/types/connection-state.types';
import { DynamicAccessConnectionUtils } from 'handlers/connect/dynamic-access-connect-utils';
import { CreateUniversalConnectionResponse } from 'webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';


export async function shellConnectHandler(
    targetType: TargetType,
    targetUser: string,
    createUniversalConnectionResponse: CreateUniversalConnectionResponse,
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService
) {
    const connectionId = createUniversalConnectionResponse.connectionId;
    let agentPublicKey = createUniversalConnectionResponse.agentPublicKey;
    let agentVersionString = createUniversalConnectionResponse.agentVersion;
    let authDetails = createUniversalConnectionResponse.connectionAuthDetails;

    const connectionHttpService = await ConnectionHttpService.init(configService, logger);
    if(targetType == TargetType.SsmTarget) {
        const connectionSummary = await connectionHttpService.GetShellConnection(connectionId);
        return createAndRunShell(configService, logger, connectionSummary);
    } else if(targetType == TargetType.Bzero || targetType == TargetType.DynamicAccessConfig) {
        if(targetType == TargetType.DynamicAccessConfig) {
            // Note: For DATs the actual target to connect to will be a
            // dynamically created target and not the id of the dynamic access
            // configuration. The dynamically created target should be returned
            // in the connectionSummary.targetId once the DAT has registered and
            // come online
            const dynamicAccessConnectionUtils = await DynamicAccessConnectionUtils.init(logger, configService);

            // Wait for the DAT to come online and then get the updated
            // connection summary.
            const connectionSummary = await dynamicAccessConnectionUtils.waitForDATConnection(connectionId);

            // Make sure the connection hasnt been closed in the meantime
            if(connectionSummary.state != ConnectionState.Open)
                throw new Error('Connection closed');

            // Finally once the dat is created and the connection is open get
            // the updated bzero target details so we can connect
            const bzeroTargetService = await BzeroTargetHttpService.init(configService, logger);
            const bzeroTarget = await bzeroTargetService.GetBzeroTarget(connectionSummary.targetId);
            agentPublicKey = bzeroTarget.agentPublicKey;
            agentVersionString = bzeroTarget.agentVersion;

            // For DATs the connectionAuthDetails in the
            // createUniversalConnectionResponse will be undefined because we
            // can only learn which connection service region to use once the
            // DAT registers with BastionZero. Therefore we explicitly call
            // GetShellConnectionAuthDetails once the DAT is online in order to
            // be able to pass the connection auth details to the daemon.
            authDetails = await connectionHttpService.GetShellConnectionAuthDetails(connectionSummary.id);
        }

        // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
        const agentVersion = parse(agentVersionString);
        if(configService.getConfigName() == 'prod' && agentVersion && lt(agentVersion, new SemVer('5.0.0'))) {
            logger.error(`Connecting to Bzero Target is only supported on agent versions >= 5.0.0. Agent version is ${agentVersion}`);
            return 1;
        }

        return startShellDaemon(configService, logger, loggerConfigService, connectionId, targetUser, agentPublicKey, authDetails, undefined);
    } else {
        throw new Error(`Unhandled target type ${targetType}`);
    }
}
