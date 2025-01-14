import { parse } from 'semver';

import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { createAndRunShell, getCliSpace, startShellDaemon } from 'utils/shell-utils';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { SpaceHttpService } from 'http-services/space/space.http-services';
import { ConnectionState } from 'webshell-common-ts/http/v2/connection/types/connection-state.types';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { LoggerConfigService } from 'services/logger/logger-config.service';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';

export async function attachHandler(
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    connectionId: string
){
    // Get Connection Info
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const connectionSummaryRequest = connectionHttpService.GetShellConnection(connectionId);

    // Get Space Info
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpaceRequest = getCliSpace(spaceHttpService, logger);

    // Make requests in parallel
    const [connectionSummary, cliSpace] = await Promise.all([connectionSummaryRequest, cliSpaceRequest]);

    if ( ! cliSpace){
        logger.error(`There is no cli session. Try creating a new connection to a target using the zli`);
        return 1;
    }
    if (connectionSummary.spaceId !== cliSpace.id){
        logger.error(`Connection ${connectionId} does not belong to the cli space`);
        return 1;
    }
    if (connectionSummary.state !== ConnectionState.Open){
        logger.error(`Connection ${connectionId} is not open`);
        return 1;
    }

    console.error(`targetType: ${connectionSummary.targetType}`);

    if(connectionSummary.targetType == TargetType.SsmTarget || connectionSummary.targetType == TargetType.DynamicAccessConfig) {
        return createAndRunShell(configService, logger, connectionSummary);
    } else if(connectionSummary.targetType == TargetType.Bzero) {
        // Get Attach Info for Bzero target. This currently just includes the datachannel id of the connection
        const attachInfoRequest = await connectionHttpService.GetShellConnectionAttachDetails(connectionId);

        const bzeroTargetService = new BzeroTargetHttpService(configService, logger);
        const bzeroTargetRequest = bzeroTargetService.GetBzeroTarget(connectionSummary.targetId);
        const connectionAuthRequest = connectionHttpService.GetShellConnectionAuthDetails(connectionSummary.id);

        // Make requests in parallel
        const [bzeroTarget, attachInfo, connectionAuthDetails] = await Promise.all([bzeroTargetRequest, attachInfoRequest, connectionAuthRequest]);

        // TODO: Adjust this check once attach is working for bzero targets
        // https://commonwealthcrypto.atlassian.net/browse/CWC-1826
        // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
        const agentVersion = parse(bzeroTarget.agentVersion);
        if(configService.getConfigName() == 'prod' && agentVersion) {
            logger.error(`Attaching to a Bzero Target is not yet supported.`);
            return 1;
        }

        return startShellDaemon(configService, logger, loggerConfigService, connectionSummary.id, connectionSummary.targetUser, bzeroTarget.agentPublicKey, connectionAuthDetails, attachInfo);
    } else {
        throw new Error(`Unhandled target type ${connectionSummary.targetType}`);
    }
}