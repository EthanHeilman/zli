import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { parseTargetString } from '../../utils/utils';
import { restartArgs } from './target-restart.command-builder';
import yargs from 'yargs';
import { cleanExit } from '../clean-exit.handler';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { waitForRestart } from '../..//system-tests/tests/utils/target-utils';
import { EventsHttpService } from '../../http-services/events/events.http-server';

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
        logger.error(`error: ${error}`);
    }
    parsedTarget.name = "john-bzero-agent";

    /* FIXME: remove
    // first, check that the agent restarted
    await waitForRestart(configService, logger, parsedTarget);

    const eventService = new EventsHttpService(configService, logger);
    const newChanges = await eventService.GetAgentStatusChangeEvents(parsedTarget.id, now);
    console.log(newChanges);
    */

    logger.info(`Agent restart initiated. To monitor your target's status, use: zli lt -d${parsedTarget.name ? ` -n ${parsedTarget.name}` : ` -i`} `)

    await cleanExit(0, logger);
}