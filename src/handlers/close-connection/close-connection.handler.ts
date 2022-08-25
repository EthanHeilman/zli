import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { closeConnectionArgs } from './close-connection.command-builder';
import yargs from 'yargs';
import { closeDbConnections, closeShellConnections } from '../../services/close-connections/close-connections.service';

export async function closeConnectionHandler(
    argv: yargs.Arguments<closeConnectionArgs>,
    configService: ConfigService,
    logger: Logger,
) {
    const handleShell = async () => {
        const cliSpaceExists = await closeShellConnections(configService, logger);
        if (!cliSpaceExists) {
            throw new Error('There is no cli session. Try creating a new connection to a target using the zli');
        }
    };
    const handleDb = () => closeDbConnections(configService, logger);

    if (argv.all) {
        // Handle closing all connections
        if (argv.type) {
            // Handle optional type filter
            switch (argv.type) {
            case 'shell':
                logger.info('Closing all shell connections');
                await handleShell();
                break;
            case 'db':
                logger.info('Closing all db connections');
                await handleDb();
                break;
            default:
                // Compile-time exhaustive check
                const exhaustiveCheck: never = argv.type;
                throw new Error(`Unhandled case: ${exhaustiveCheck}`);
            }
        } else {
            // Otherwise close all types of connections
            logger.info('Closing all shell and db connections');
            await Promise.all([handleDb(), handleShell()]);
        }
    } else {
        // Handle closing specific connection
        const connectionHttpService = new ConnectionHttpService(configService, logger);
        await connectionHttpService.CloseConnection(argv.connectionId);
        logger.info(`Connection ${argv.connectionId} successfully closed`);
    }

    await cleanExit(0, logger);
}