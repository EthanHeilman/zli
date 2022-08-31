import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { parseTargetString } from '../../utils/utils';
import { restartArgs } from './target-restart.command-builder';
import yargs from 'yargs';
import { cleanExit } from '../clean-exit.handler';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { EventsHttpService } from '../../http-services/events/events.http-server';
import { listTargets } from '../../services/list-targets/list-targets.service';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { ParsedTargetString } from '../../services/common.types';

export async function targetRestartHandler(
    argv: yargs.Arguments<restartArgs>,
    configService: ConfigService,
    logger: Logger
) {
    if (!configService.me().isAdmin) {
        throw Error('Must be an admin to restart a bzero target');
    }

    const parsedTarget = parseTargetString(argv.targetString);

    const bzeroTargetService = new BzeroTargetHttpService(configService, logger);

    const now = new Date(new Date().toUTCString());
    try {
        await bzeroTargetService.RestartBzeroTarget({
            targetName: parsedTarget.name,
            targetId: parsedTarget.id,
            envId: parsedTarget.envId,
            envName: parsedTarget.envName,
        });
    } catch (error) {
        logger.error(error);
        await cleanExit(1, logger);
    }
    parsedTarget.name = "john-bzero-agent";

    // first, check that the agent restarted
    /*
    await waitForRestart(configService, logger, parsedTarget);

    const eventService = new EventsHttpService(configService, logger);
    const newChanges = await eventService.GetAgentStatusChangeEvents(parsedTarget.id, now);
    console.log(newChanges);
    */

    logger.info(`Agent restart initiated. To monitor your target's status, use: zli lt -d${parsedTarget.name ? ` -n ${parsedTarget.name}` : ` -i`} `)

    await cleanExit(0, logger);
}

export async function waitForRestart(configService: ConfigService, logger: Logger, targetString: ParsedTargetString) {
    let goneOffline = false;
    let backOnline = false;
    // TODO: support other target notations
    while (!goneOffline) {
        const targets = await listTargets(configService, logger, [TargetType.Bzero]);
        const myTarget = targets.filter(target => target.name === targetString.name);
        if (myTarget.length !== 1) {
            throw new Error(`Expected 1 target but got ${myTarget.length}`);
        } else {
            goneOffline = myTarget[0].status === TargetStatus.Offline;
        }
    }

    console.log("Gone offline!")

    while (!backOnline) {
        const targets = await listTargets(configService, logger, [TargetType.Bzero]);
        const myTarget = targets.filter(target => target.name === targetString.name);
        if (myTarget.length !== 1) {
            throw new Error(`Expected 1 target but got ${myTarget.length}`);
        } else {
            backOnline = myTarget[0].status === TargetStatus.Online;
        }
    }
}