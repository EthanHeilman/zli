import { parse } from 'semver';

import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { createAndRunShell, getCliSpace, pushToStdOut, startShellDaemon } from '../../utils/shell-utils';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { ConnectionState } from '../../../webshell-common-ts/http/v2/connection/types/connection-state.types';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';

export async function attachHandler(
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    connectionId: string
){
    // Get Connection Info
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const connectionSummaryRequest = connectionHttpService.GetConnection(connectionId);

    // Get Space Info
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpaceRequest = getCliSpace(spaceHttpService, logger);

    // Get Attach Info
    const attachInfoRequest = connectionHttpService.GetShellConnectionAttachDetails(connectionId);

    // Make requests in parallel
    const [connectionSummary, cliSpace, attachInfo] = await Promise.all([connectionSummaryRequest, cliSpaceRequest, attachInfoRequest]);

    if ( ! cliSpace){
        logger.error(`There is no cli session. Try creating a new connection to a target using the zli`);
        await cleanExit(1, logger);
    }
    if (connectionSummary.spaceId !== cliSpace.id){
        logger.error(`Connection ${connectionId} does not belong to the cli space`);
        await cleanExit(1, logger);
    }
    if (connectionSummary.state !== ConnectionState.Open){
        logger.error(`Connection ${connectionId} is not open`);
        await cleanExit(1, logger);
    }

    if(connectionSummary.targetType == TargetType.SsmTarget || connectionSummary.targetType == TargetType.DynamicAccessConfig) {
        return createAndRunShell(configService, logger, connectionSummary, pushToStdOut);
    } else if(connectionSummary.targetType == TargetType.Bzero) {
        const bzeroTargetService = new BzeroTargetHttpService(configService, logger);
        const bzeroTarget = await bzeroTargetService.GetBzeroTarget(connectionSummary.targetId);

        // TODO: Adjust this version check once pipelining changes are in and we support attaching
        // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
        const agentVersion = parse(bzeroTarget.agentVersion);
        if(agentVersion) {
            logger.error(`Attaching to a Bzero Target is not yet supported.`);
            return 1;
        }

        return startShellDaemon(configService, logger, loggerConfigService, connectionSummary, bzeroTarget, attachInfo);
    } else {
        throw new Error(`Unhandled target type ${connectionSummary.targetType}`);
    }
}