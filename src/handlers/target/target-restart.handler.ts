import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { parseTargetString } from 'utils/utils';
import { restartArgs } from 'handlers/target/target-restart.command-builder';
import yargs from 'yargs';
import { cleanExit } from 'handlers/clean-exit.handler';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';

export async function targetRestartHandler(
    argv: yargs.Arguments<restartArgs>,
    configService: ConfigService,
    logger: Logger
) {
    if (!(await configService.me()).isAdmin) {
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
        logger.error(error);
        await cleanExit(1, logger);
    }

    logger.info(`Agent restart initiated. To monitor your target's status, use: zli lt -d${parsedTarget.name ? ` -n ${parsedTarget.name}` : ` -i`} `);

    await cleanExit(0, logger);
}