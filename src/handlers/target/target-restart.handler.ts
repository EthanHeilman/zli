import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { parseTargetString } from '../../utils/utils';
import { restartArgs } from './target-restart.command-builder';
import yargs from 'yargs';
import { cleanExit } from '../clean-exit.handler';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { EventsHttpService } from '../../http-services/events/events.http-server';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';

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
    await bzeroTargetService.RestartBzeroTarget({
        targetName: parsedTarget.name,
        targetId: parsedTarget.id,
        envId: parsedTarget.envId,
        envName: parsedTarget.envName,
    });

    /*
    const eventService = new EventsHttpService(configService, logger);
    // TODO: not that this even lives here but obviously need to fix this
    const x = await eventService.GetAgentStatusChangeEvents(parsedTarget.id, TargetType.Bzero);
    console.log(x);
    */

    await cleanExit(0, logger);
}