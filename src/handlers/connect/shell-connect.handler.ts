import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { SemVer, lt, parse } from 'semver';

import { connectCheckAllowedTargetUsers, targetStringExample } from '../../utils/utils';
import { createAndRunShell, getCliSpace, startShellDaemon } from '../../utils/shell-utils';
import { ParsedTargetString } from '../../services/common.types';
import { MixpanelService } from '../../services/Tracking/mixpanel.service';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { BzeroAgentSummary } from '../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { ConnectionState } from '../../../webshell-common-ts/http/v2/connection/types/connection-state.types';
import { DynamicAccessConnectionUtils } from './dynamic-access-connect-utils';


export async function shellConnectHandler(
    configService: ConfigService,
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    mixpanelService: MixpanelService,
    parsedTarget: ParsedTargetString
) {
    if(! parsedTarget) {
        logger.error('No targets matched your targetName/targetId or invalid target string, must follow syntax:');
        logger.error(targetStringExample);
        await cleanExit(1, logger);
    }

    // If the user is an admin make sure they have a policy that allows access
    // to the target. If they are a non-admin then they must have a policy that
    // allows access to even be able to list and parse the target
    const me = configService.me();
    if(me.isAdmin) {
        const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
        const response = await policyQueryHttpService.TargetConnectPolicyQuery([parsedTarget.id], parsedTarget.type, me.email);
        if (response[parsedTarget.id].allowed != true) {
            logger.error(`You do not have a TargetAccess policy setup to access ${parsedTarget.name}`);
            await cleanExit(1, logger);
        }
    }

    const bzeroTargetService = new BzeroTargetHttpService(configService, logger);
    let bzeroTarget: BzeroAgentSummary;

    // Check targetUser/Verb
    let allowedTargetUsers: string[] = [];
    let allowedVerbs: string[] = [];
    if(parsedTarget.type == TargetType.SsmTarget) {
        const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
        const ssmTarget = await ssmTargetHttpService.GetSsmTarget(parsedTarget.id);
        allowedTargetUsers = ssmTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = ssmTarget.allowedVerbs.map(v => v.type);
    } else if(parsedTarget.type == TargetType.DynamicAccessConfig) {
        const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
        const dynamicAccessTarget = await dynamicConfigHttpService.GetDynamicAccessConfig(parsedTarget.id);
        allowedTargetUsers = dynamicAccessTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = dynamicAccessTarget.allowedVerbs.map(v => v.type);
    } else if (parsedTarget.type == TargetType.Bzero) {
        bzeroTarget = await bzeroTargetService.GetBzeroTarget(parsedTarget.id);
        allowedTargetUsers = bzeroTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = bzeroTarget.allowedVerbs.map(v => v.type);
    }

    if(! allowedVerbs.includes(VerbType.Shell)) {
        logger.error(`You do not have a TargetAccess policy that allows Shell access to target ${parsedTarget.name}`);
        await cleanExit(1, logger);
    }

    const targetUser = await connectCheckAllowedTargetUsers(parsedTarget.name, parsedTarget.user, allowedTargetUsers, logger);

    // Get the existing if any or create a new cli space id
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);
    let cliSpaceId: string;
    if (cliSpace === undefined)
    {
        cliSpaceId = await spaceHttpService.CreateSpace('cli-space');
    } else {
        cliSpaceId = cliSpace.id;
    }

    // make a new connection
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const connectionId = await connectionHttpService.CreateConnection(parsedTarget.type, parsedTarget.id, cliSpaceId, targetUser);
    let connectionSummary = await connectionHttpService.GetShellConnection(connectionId);

    mixpanelService.TrackNewConnection(parsedTarget.type);

    if(parsedTarget.type == TargetType.SsmTarget) {
        return createAndRunShell(configService, logger, connectionSummary);
    } else if(parsedTarget.type == TargetType.Bzero || parsedTarget.type == TargetType.DynamicAccessConfig) {
        if(parsedTarget.type == TargetType.DynamicAccessConfig) {
            // Note: For DATs the actual target to connect to will be a
            // dynamically created target and not the id of the dynamic access
            // configuration. The dynamically created target should be returned
            // in the connectionSummary.targetId once the DAT has registered and
            // come online
            const dynamicAccessConnectionUtils = new DynamicAccessConnectionUtils(logger, configService);

            // Wait for the DAT to come online and then get the updated
            // connection summary.
            connectionSummary = await dynamicAccessConnectionUtils.waitForDATConnection(connectionSummary.id);

            // Make sure the connection hasnt been closed in the meantime
            if(connectionSummary.state != ConnectionState.Open)
                throw new Error('Connection closed');

            // Finally once the dat is created and the connection is open get
            // the updated bzero target details so we can connect
            bzeroTarget = await bzeroTargetService.GetBzeroTarget(connectionSummary.targetId);
        }

        // agentVersion will be null if this isn't a valid version (i.e if its "$AGENT_VERSION" string during development)
        const agentVersion = parse(bzeroTarget.agentVersion);
        if(configService.getConfigName() == 'prod' && agentVersion && lt(agentVersion, new SemVer('5.0.0'))) {
            logger.error(`Connecting to Bzero Target is only supported on agent versions >= 5.0.0. Agent version is ${agentVersion}`);
            return 1;
        }

        return startShellDaemon(configService, logger, loggerConfigService, connectionSummary, bzeroTarget, undefined);
    } else {
        throw new Error(`Unhandled target type ${parsedTarget.type}`);
    }
}
