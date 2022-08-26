import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { parseTargetString } from '../../utils/utils';
import { restartArgs } from './target-restart.command-builder';
import yargs from 'yargs';
import { cleanExit } from '../clean-exit.handler';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { EventsHttpService } from '../../http-services/events/events.http-server';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { listTargets } from '../../services/list-targets/list-targets.service';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetStatus.types';

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

    logger.info(`Agent restart initiated. To monitor your target's status, use: zli lt -d${parsedTarget.name ? ` -n ${parsedTarget.name}` : ` -i`} `)

    await cleanExit(0, logger);
}