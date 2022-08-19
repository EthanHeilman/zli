import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { parseTargetString, parseTargetType } from '../../utils/utils';
import { restartArgs } from './target-restart.command-builder';
import yargs from 'yargs';
import { cleanExit } from '../clean-exit.handler';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';

export async function targetRestartHandler(
    argv: yargs.Arguments<restartArgs>,
    configService: ConfigService,
    logger: Logger
) {
    if (!configService.me().isAdmin) {
        throw Error('Must be an admin to restart a target');
    }

    const parsedTarget = parseTargetString(argv.targetString);

    if (parsedTarget.type != TargetType.Bzero) {
        throw Error(`Invalid target type: ${JSON.stringify(parsedTarget)} Only bzero targets can be restarted`);
    }

    await cleanExit(0, logger);
}