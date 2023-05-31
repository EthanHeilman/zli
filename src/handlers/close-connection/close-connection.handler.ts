import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { closeConnectionArgs } from 'handlers/close-connection/close-connection.command-builder';
import yargs from 'yargs';
import { closeConnections, closeShellConnections } from 'services/close-connections/close-connections.service';
import { isError } from 'lodash';

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
                await closeConnections(configService, logger, 'db');
                break;
            case 'kube':
                logger.info('Closing all kube connections');
                await closeConnections(configService, logger, 'kube');
                break;
            default:
                // Compile-time exhaustive check
                const exhaustiveCheck: never = argv.type;
                throw new Error(`Unhandled case: ${exhaustiveCheck}`);
            }
        } else {
            // Otherwise close all types of connections
            logger.info('Closing all shell, db, and kube connections');

            const results = await Promise.allSettled([
                handleShell(),
                closeConnections(configService, logger, 'db'),
                closeConnections(configService, logger, 'kube'),
            ]);
            const allErrors = results.reduce<any[]>((acc, result) => result.status === 'rejected' ? [...acc, result.reason] : acc, []);
            if (allErrors.length > 0) {
                const messages = allErrors.reduce<string[]>((acc, err) => isError(err) ? [...acc, err.message] : acc, []);
                throw new Error(`Failed closing at least one connection: ${messages.join(', ')}`);
            }
        }
    } else {
        // Handle closing specific connection
        const connectionHttpService = await ConnectionHttpService.init(configService, logger);
        await connectionHttpService.CloseConnection(argv.connectionId);
        logger.info(`Connection ${argv.connectionId} successfully closed`);
    }

    await cleanExit(0, logger);
}