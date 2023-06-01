import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { createTableWithWordWrap, toUpperCase } from 'utils/utils';
import { listConnectionsArgs } from 'handlers/list-connections/list-connections.command-builder';
import yargs from 'yargs';
import { ConnectionInfo } from 'services/list-connections/list-connections.service.types';
import { listOpenDbConnections, listOpenKubeConnections, listOpenRDPConnections, listOpenShellConnections } from 'services/list-connections/list-connections.service';
import { cleanExit } from 'handlers/clean-exit.handler';

export async function listConnectionsHandler(
    argv: yargs.Arguments<listConnectionsArgs>,
    configService: ConfigService,
    logger: Logger
) {
    const printTableOrJson = async <T extends NormalizedConnectionInfo>(type: 'shell' | 'db' | 'rdp' | 'kube' | 'all', connections: T[]) => {
        if (!!argv.json) {
            // json output
            console.log(JSON.stringify(connections));
        } else {
            if (connections.length === 0) {
                if (type == 'all') {
                    logger.info('There are no open connections');
                } else {
                    logger.info(`There are no open ${type} connections`);
                }
                return;
            }
            // regular table output
            const tableString = getTableOfConnections(connections);
            console.log(tableString);
        }
    };

    if (argv.type) {
        switch (argv.type) {
        case 'shell':
            const openShellConnections = await listOpenShellConnections(configService, logger);
            await printTableOrJson('shell', normalizeConnectionInfos(openShellConnections));
            break;
        case 'db':
            const openDbConnections = await listOpenDbConnections(configService, logger);
            await printTableOrJson('db', normalizeConnectionInfos(openDbConnections));
            break;
        case 'rdp':
            const openRDPConnections = await listOpenRDPConnections(configService, logger);
            await printTableOrJson('rdp', normalizeConnectionInfos(openRDPConnections));
            break;
        case 'kube':
            const openKubeConnections = await listOpenKubeConnections(configService, logger);
            await printTableOrJson('kube', normalizeConnectionInfos(openKubeConnections));
            break;
        default:
            // Compile-time exhaustive check
            const exhaustiveCheck: never = argv.type;
            throw new Error(`Unhandled case: ${exhaustiveCheck}`);
        }
    } else {
        // If type option not provided, get all open connections

        // Get open shell and db connections concurrently
        const [shellConnections, dbConnections, kubeConnections] = await Promise.all([
            listOpenShellConnections(configService, logger),
            listOpenDbConnections(configService, logger),
            listOpenRDPConnections(configService, logger),
            listOpenKubeConnections(configService, logger)
        ]);
        await printTableOrJson('all', normalizeConnectionInfos([...shellConnections, ...dbConnections, ...kubeConnections]));
    }

    await cleanExit(0, logger);
}

// This type should conform to the table output's columns, so that the --json
// option output stays consistent with table output
interface NormalizedConnectionInfo {
    type: string;
    connectionId: string;
    targetUser: string;
    target: string;
    timeCreated: string;
}

function normalizeConnectionInfos(connections: ConnectionInfo[]): NormalizedConnectionInfo[] {
    const dateOptions = { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
    return connections.map<NormalizedConnectionInfo>((conn) => {
        // Build common parameters
        const type = toUpperCase(conn.type);
        const connectionId = conn.connectionId;
        const target = conn.targetName;
        const timeCreated = new Date(conn.timeCreated).toLocaleString('en-US', dateOptions as any);

        // Special logic for these parameters (targetUser)
        let targetUser: string;
        switch (conn.type) {
        case 'db':
            // Target users are only used by SplitCert connections; otherwise will be undefined
            targetUser = conn.targetUser ? conn.targetUser : 'N/A';
            break;
        case 'rdp':
            // Target users are not utilized for RDP
            targetUser = 'N/A';
            break;
        case 'shell':
            targetUser = conn.targetUser;
            break;
        case 'kube':
            targetUser = conn.targetUser;
            break;
        default:
            // Compile-time exhaustive check
            const exhaustiveCheck: never = conn;
            throw new Error(`Unhandled case: ${exhaustiveCheck}`);
        }

        return {
            type: type,
            connectionId: connectionId,
            targetUser: targetUser,
            target: target,
            timeCreated: timeCreated
        };
    });
}

function getTableOfConnections(connections: NormalizedConnectionInfo[]): string {
    const header: string[] = ['Type', 'Connection ID', 'Target User', 'Target', 'Time Created'];
    const rows = connections.map<string[]>((conn) => {
        return [
            conn.type,
            conn.connectionId,
            conn.targetUser,
            conn.target,
            conn.timeCreated
        ];
    });
    return createTableWithWordWrap(header, rows);
}