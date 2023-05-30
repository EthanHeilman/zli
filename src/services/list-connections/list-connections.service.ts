import { SpaceHttpService } from 'http-services/space/space.http-services';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { SsmTargetHttpService } from 'http-services/targets/ssm/ssm-target.http-services';
import { ConnectionState } from 'webshell-common-ts/http/v2/connection/types/connection-state.types';
import { getCliSpace } from 'utils/shell-utils';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { DbConnectionInfo, KubeConnectionInfo, RDPConnectionInfo, ShellConnectionInfo } from 'services/list-connections/list-connections.service.types';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { SsmTargetSummary } from 'webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { BzeroAgentSummary } from 'webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';

export async function listOpenShellConnections(
    configService: ConfigService,
    logger: Logger
) : Promise<ShellConnectionInfo[]>
{
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const bzeroTargetService = new BzeroTargetHttpService(configService, logger);

    const cliSpace = await getCliSpace(spaceHttpService, logger);
    if (cliSpace == undefined) {
        return [];
    }

    // Both Bzero and SSM shell connections exist in spaces
    const openShellConnections = cliSpace.connections.filter(c => c.state === ConnectionState.Open);
    if (openShellConnections.length === 0) {
        return [];
    }

    // Get target info concurrently
    const ssmTargetSummaries = async () => (await ssmTargetHttpService.ListSsmTargets(true));
    const bzeroTargetSummaries = async () => (await bzeroTargetService.ListBzeroTargets());
    const allTargets = (await Promise.all([ssmTargetSummaries(), bzeroTargetSummaries()])).reduce<Array<SsmTargetSummary | BzeroAgentSummary>>((acc, el) => acc.concat(el), []);

    // TODO: CWC-2042 Remove call to target summaries and usage of .filter() and
    // .pop()
    return openShellConnections.map<ShellConnectionInfo>((conn) => ({
        type: 'shell',
        connectionId: conn.id,
        targetUser: conn.targetUser,
        targetName: allTargets.filter(t => t.id == conn.targetId).pop().name,
        timeCreated: conn.timeCreated,
    }));
}

export async function listOpenDbConnections(
    configService: ConfigService,
    logger: Logger
): Promise<DbConnectionInfo[]> {
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const openDbConnections = await connectionHttpService.ListDbConnections(ConnectionState.Open);
    if (openDbConnections.length === 0) {
        return [];
    }

    return openDbConnections.map<DbConnectionInfo>((conn) => ({
        type: 'db',
        connectionId: conn.id,
        targetName: conn.targetName,
        timeCreated: conn.timeCreated,
        remoteHost: `${conn.remoteHost}:${conn.remotePort}`,
        targetUser: conn.targetUser,
    }));
}

export async function listOpenRDPConnections(
    configService: ConfigService,
    logger: Logger
): Promise<RDPConnectionInfo[]> {
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const openRDPConnections = await connectionHttpService.ListRDPConnections(ConnectionState.Open);
    if (openRDPConnections.length === 0) {
        return [];
    }

    return openRDPConnections.map<RDPConnectionInfo>((conn) => ({
        type: 'rdp',
        connectionId: conn.id,
        targetName: conn.targetName,
        timeCreated: conn.timeCreated,
        remoteHost: `${conn.remoteHost}:${conn.remotePort}`
    }));
}

export async function listOpenKubeConnections(
    configService: ConfigService,
    logger: Logger
): Promise<KubeConnectionInfo[]> {
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const openKubeConnections = await connectionHttpService.ListKubeConnections(ConnectionState.Open);
    if (openKubeConnections.length === 0) {
        return [];
    }

    return openKubeConnections.map<KubeConnectionInfo>((conn) => ({
        type: 'kube',
        connectionId: conn.id,
        targetName: conn.targetName,
        timeCreated: conn.timeCreated,
        targetUser: conn.targetUser,
        targetGroups: conn.targetGroups
    }));
}