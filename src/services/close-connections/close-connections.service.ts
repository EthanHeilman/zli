import { isError } from 'lodash';
import { BaseConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/base-connection-summary.types';
import { ConnectionState } from 'webshell-common-ts/http/v2/connection/types/connection-state.types';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { SpaceHttpService } from 'http-services/space/space.http-services';
import { getCliSpace } from 'utils/shell-utils';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';

/**
 * Close all of the user's shell (Bzero+SSM) connections
 * @returns False if there is no cli-space. Otherwise, True.
 */
export async function closeShellConnections(
    configService: ConfigService,
    logger: Logger
): Promise<boolean> {
    const spaceHttpService = await SpaceHttpService.init(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);
    if (!cliSpace) {
        return false;
    }

    await spaceHttpService.CloseSpace(cliSpace.id);
    await spaceHttpService.CreateSpace('cli-space');

    return true;
};

/**
 * Close open connections for specific type of connection. All close requests
 * are issued concurrently and failing to close one connection does not cancel
 * outstanding close requests. An error is thrown, once all requests have
 * finished, if at least one connection failed to close
 */
export async function closeConnections(
    configService: ConfigService,
    logger: Logger,
    type: 'db' | 'kube'
): Promise<void> {
    const connectionHttpService = await ConnectionHttpService.init(configService, logger);

    let connections: BaseConnectionSummary[];
    switch (type) {
    case 'db':
        connections = await connectionHttpService.ListDbConnections(ConnectionState.Open);
        break;
    case 'kube':
        connections = await connectionHttpService.ListKubeConnections(ConnectionState.Open);
        break;
    default:
        // Compile-time exhaustive check
        const exhaustiveCheck: never = type;
        throw new Error(`Unhandled case: ${exhaustiveCheck}`);
    }

    const results = await Promise.allSettled(connections.map(conn => connectionHttpService.CloseConnection(conn.id)));
    const allErrors = results.reduce<any[]>((acc, result) => result.status === 'rejected' ? [...acc, result.reason] : acc, []);

    if (allErrors.length > 0) {
        const messages = allErrors.reduce<string[]>((acc, err) => isError(err) ? [...acc, err.message] : acc, []);
        throw new Error(`Failed closing at least one ${type} connection: ${messages.join(', ')}`);
    }
}