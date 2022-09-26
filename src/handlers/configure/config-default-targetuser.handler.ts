import yargs from 'yargs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { configDefaultTargetUserArgs } from './config-default-targetuser.command-builder';
import { ConnectConfig } from '../../services/config/config.service.types';

export async function configDefaultTargetUserHandler(argv: yargs.Arguments<configDefaultTargetUserArgs>, configService: ConfigService, logger: Logger) {
    // This is handled manually so that the user isn't required
    // to have a positional argument to use the --reset flag
    if(argv.targetUser === undefined && argv.reset === undefined) {
        logger.error('A target user must be provided for this command.');
        await cleanExit(0, logger);
    }

    let connectConfig: ConnectConfig;
    let loggerStatement;
    if(argv.reset === undefined) {
        connectConfig = { targetUser: argv.targetUser };
        loggerStatement = `Local default target user for shell, SSH, and SCP set to ${argv.targetUser}. This has been saved to your config here: ${configService.configPath()}`;
    } else {
        connectConfig = { targetUser: null };
        loggerStatement = 'Local default target user for shell, SSH, and SCP has been removed.';
    }
    configService.setConnectConfig(connectConfig);
    logger.info(loggerStatement);
    await cleanExit(0, logger);
}
