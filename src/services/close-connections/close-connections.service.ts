import { ConnectionState } from '../../../webshell-common-ts/http/v2/connection/types/connection-state.types';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { getCliSpace } from '../../utils/shell-utils';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';

/**
 * Close all of the user's shell (Bzero+SSM) connections
 * @returns False if there is no cli-space. Otherwise, True.
 */
export async function closeShellConnections(
    configService: ConfigService,
    logger: Logger
): Promise<boolean> {
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);
    if (!cliSpace) {
        return false;
    }

    await spaceHttpService.CloseSpace(cliSpace.id);
    await spaceHttpService.CreateSpace('cli-space');

    return true;
};

/**
 * Close all of the user's db connections
 * @returns A promise that is resolved when all db connections have been closed or rejected when any of the db connections failed to close
 */
export async function closeDbConnections(
    configService: ConfigService,
    logger: Logger
): Promise<void> {
    const connectionHttpService = new ConnectionHttpService(configService, logger);

    // Send close requests concurrently and wait for all promises to
    // resolve/reject
    const openDbConnections = await connectionHttpService.ListDbConnections(ConnectionState.Open);
    await Promise.all(openDbConnections.map(conn => connectionHttpService.CloseConnection(conn.id)));
}