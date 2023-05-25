import { DaemonConfig, DaemonConfigs, DaemonConfigType, DbConfig, getDefaultDbConfig, getDefaultKubeConfig, KubeConfig } from 'services/config/config.service.types';
import { ProcessManagerService } from 'services/process-manager/process-manager.service';
import { DaemonIsRunningStatus, DaemonRunningStatus, DaemonStatus } from 'services/daemon-management/types/daemon-status.types';
import { KillProcessResultType } from 'services/process-manager/process-manager.service.types';
import { DisconnectResult } from 'services/daemon-management/types/disconnect-result.types';

export interface DaemonStore<T extends DaemonConfig> {
    setDaemons(daemons: DaemonConfigs<T>): void;
    getDaemons(): DaemonConfigs<T>;
}

export interface ProcessManager {
    isProcessRunning(pid: number): boolean;
    tryShutDownProcess(controlPort: number, localPid: number): Promise<KillProcessResultType>;
}

export const LEGACY_KEY_STRING: string = 'n/a';

/**
 * DaemonManagementService is a service that centralizes the management of
 * locally running daemons (DB, Kube, Web) on the user's machine.
 *
 * Some of the included features of this service:
 *
 * (1) Manage the addition/removal of daemon configs from an arbitrary KV store.
 *
 * (2) Shut down or force-kill a daemon

 * (3) Provide daemon's status (e.g. daemon quit unexpectedly).
 *
 * This class handles the legacy configuration (non-KV dictionary) and the new
 * configuration where daemon configs are stored in a dictionary keyed by their
 * connectionId. The class can be simplified once we can move away from the
 * legacy configuration.
 */
export class DaemonManagementService<T extends DaemonConfig> {
    public readonly configType: DaemonConfigType;

    constructor(
        newDefaultDaemonConfig: () => T,
        private processManager: ProcessManager,
        private daemonStore: DaemonStore<T>
    ) {
        this.configType = newDefaultDaemonConfig().type;
    }

    /**
     * Get all daemon configs stored in both the legacy config (non-KV
     * dictionary) and the new configuration where daemon configs are stored in
     * a dictionary keyed by their connection ID.
     * @returns A dictionary of configs. The key is undefined if no connection
     * ID is found.
     */
    public getDaemonConfigs(): Map<string | undefined, T> {
        const result: Map<string | undefined, T> = new Map();
        for (const [connId, daemonConfig] of Object.entries(this.daemonStore.getDaemons())) {
            if (connId === LEGACY_KEY_STRING) {
                result.set(undefined, daemonConfig);
            } else {
                result.set(connId, daemonConfig);
            }
        }

        return result;
    }

    /**
     * Add a daemon config to the KV store
     * @param connectionId Connection ID bound to this daemon. Must be defined
     * otherwise this function throws an error.
     * @param config Daemon config object
     */
    public addDaemon(connectionId: string, config: T) {
        if (!connectionId) {
            throw new Error('Cannot add a daemon to local store if connection ID is undefined');
        }

        const daemons = this.daemonStore.getDaemons();
        daemons[connectionId] = config;
        this.daemonStore.setDaemons(daemons);
    }

    private deleteDaemon(connectionId: string | undefined) {
        const daemons = this.daemonStore.getDaemons();
        if (connectionId) {
            delete daemons[connectionId];
        } else {
            // This private method is called on the result of getDaemonConfigs()
            // which uses a key of undefined to indicate that it read a legacy
            // config which has no connection ID stored. We can delete the
            // legacy config from the daemonStore by referencing the
            // LEGACY_KEY_STRING that was used when parsing.
            delete daemons[LEGACY_KEY_STRING];
        }
        this.daemonStore.setDaemons(daemons);
    }
    /**
     * Get status for daemon with specific connection ID
     * @param connectionId Connection ID of the daemon to get status for
     * @param shouldRemoveFromConfig Whether the daemon should be removed from
     * the config if it is no longer running or quits unexpectedly. Defaults to
     * true.
     * @returns Daemon status if there is a daemon with provided connection ID.
     * Throws an error if no daemon is found.
     */
    public async getDaemonStatus(connectionId: string | undefined, shouldRemoveFromConfig: boolean = true): Promise<DaemonStatus<T>> {
        const daemonConfigs = this.getDaemonConfigs();
        const foundDaemonConfig = daemonConfigs.get(connectionId);
        if (!foundDaemonConfig) {
            throw new Error(`There is no daemon with connection ID: ${connectionId}`);
        }

        return this.handleDaemonStatus(connectionId, foundDaemonConfig, shouldRemoveFromConfig);
    }

    private async handleDaemonStatus(connectionId: string, config: T, shouldRemoveFromConfig: boolean = true): Promise<DaemonStatus<T>> {
        if (config.localPid == null) {
            // Remove daemon from config, so we don't show it in status anymore
            if (shouldRemoveFromConfig)
                this.deleteDaemon(connectionId);

            return { type: 'no_daemon_running', connectionId: connectionId, config: config };
        } else {
            // Check if the pid is still alive
            if (!this.processManager.isProcessRunning(config.localPid)) {
                // Remove daemon from config, so we don't show it in status
                // anymore
                if (shouldRemoveFromConfig)
                    this.deleteDaemon(connectionId);

                return { type: 'daemon_quit_unexpectedly', connectionId: connectionId, config: config };
            }

            // Add different result to map depending on the config type
            const localUrl = `${config.localHost}:${config.localPort}`;
            switch (config.type) {
            case 'web':
            case 'db':
                return {
                    type: 'daemon_is_running',
                    connectionId: connectionId,
                    config: config,
                    status: {
                        type: config.type,
                        targetName: config.name,
                        localUrl: localUrl
                    } as Extract<DaemonRunningStatus, { type: T['type'] }>
                };
            case 'kube':
                return {
                    type: 'daemon_is_running',
                    connectionId: connectionId,
                    config: config,
                    status: {
                        type: config.type,
                        localUrl: localUrl,
                        targetCluster: config.targetCluster,
                        targetUser: config.targetUser,
                        targetGroups: config.targetGroups.join(','),
                    } as Extract<DaemonRunningStatus, { type: T['type'] }>
                };
            default:
                // Compile-time exhaustive check
                const _exhaustiveCheck: never = config;
                throw new Error(`Unhandled case: ${_exhaustiveCheck}`);
            }
        }
    }

    /**
     * Get statuses for all daemons stored in the map
     * @param shouldRemoveFromConfig Whether the daemon should be removed from
     * the config if it is no longer running or quits unexpectedly. Defaults to
     * true.
     * @returns A dictionary of results where the key is the connection ID or
     * undefined if there is no connection ID stored, and the value is the
     * daemon's status.
     */
    public async getAllDaemonStatuses(shouldRemoveFromConfig: boolean = true): Promise<Map<string | undefined, DaemonStatus<T>>> {
        const resultMap: Map<string, DaemonStatus<T>> = new Map();
        const daemonConfigs = this.getDaemonConfigs();
        for (const [connectionId, config] of daemonConfigs) {
            const statusResult = await this.handleDaemonStatus(connectionId, config, shouldRemoveFromConfig);
            resultMap.set(connectionId, statusResult);
        }

        return resultMap;
    }

    /**
     * Disconnect from all daemons stored in the map
     * @returns A dictionary of results where the key is the connection ID or
     * undefined if there is no connection ID stored, and the value is the
     * result of disconnecting.
     */
    public async disconnectAllDaemons(): Promise<Map<string | undefined, DisconnectResult<T>>> {
        const resultMap: Map<string, DisconnectResult<T>> = new Map();
        const daemonConfigs = this.getDaemonConfigs();

        const shutDownButAlwaysResolve = async (connectionId: string, daemonConfig: T): Promise<[string, DisconnectResult<T>]> => {
            if (daemonConfig.localPid == null) {
                return [connectionId, { type: 'daemon_pid_not_set', daemon: daemonConfig }];
            }

            try {
                const killResult = await this.processManager.tryShutDownProcess(daemonConfig.controlPort, daemonConfig.localPid);
                return [connectionId, { type: 'daemon_success_killed', daemon: daemonConfig, killResult: killResult }];
            } catch (err: any) {
                return [connectionId, { type: 'daemon_fail_killed', daemon: daemonConfig, error: err }];
            }
        };

        // Attempt to shut down all daemons concurrently
        const results = await Promise.all(
            Array
                .from(daemonConfigs.entries())
                .map(([connectionId, daemonConfig]) => shutDownButAlwaysResolve(connectionId, daemonConfig)
                ));

        // Process results
        results.forEach(([connectionId, result]) => {
            // Delete daemon from config and track decision
            this.deleteDaemon(connectionId);
            resultMap.set(connectionId, result);
        });

        return resultMap;
    }
}

export interface DbDaemonStore {
    setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>): void;
    getDbDaemons(): DaemonConfigs<DbConfig>;
}

export function newDbDaemonManagementService(
    dbDaemonStore: DbDaemonStore,
    processManager?: ProcessManager
): DaemonManagementService<DbConfig> {
    // Default implementation
    if (!processManager) {
        processManager = new ProcessManagerService();
    }

    return new DaemonManagementService(
        getDefaultDbConfig,
        processManager,
        // Construct a mapping from DbDaemonStore to DaemonStore
        {
            setDaemons: (daemons: DaemonConfigs<DbConfig>) => dbDaemonStore.setDbDaemons(daemons),
            getDaemons: () => dbDaemonStore.getDbDaemons(),
        }
    );
}

export interface KubeDaemonStore {
    setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>): void;
    getKubeDaemons(): DaemonConfigs<KubeConfig>;
}

export function newKubeDaemonManagementService(
    kubeDaemonStore: KubeDaemonStore,
    processManager?: ProcessManager
): DaemonManagementService<KubeConfig> {
    // Default implementation
    if (!processManager) {
        processManager = new ProcessManagerService();
    }

    return new DaemonManagementService(
        getDefaultKubeConfig,
        processManager,
        // Construct a mapping from DbDaemonStore to DaemonStore
        {
            setDaemons: (daemons: DaemonConfigs<KubeConfig>) => kubeDaemonStore.setKubeDaemons(daemons),
            getDaemons: () => kubeDaemonStore.getKubeDaemons(),
        }
    );
}

export interface IDaemonStatusRetriever<T extends DaemonConfig> {
    getAllDaemonStatuses(shouldRemoveFromConfig?: boolean): Promise<Map<string, DaemonStatus<T>>>;
}

/**
 * Finds a running daemon with a specific connection ID
 * @param daemonManagementService  Daemon management service
 * @param connectionId Connection ID to search for
 * @returns If a matching daemon is found, returns DaemonIsRunningStatus.
 * Otherwise, returns undefined if no matching daemon can be found.
 */
export async function findRunningDaemonWithConnectionID<T extends DaemonConfig>(
    daemonManagementService: IDaemonStatusRetriever<T>,
    connectionId: string
): Promise<DaemonIsRunningStatus<T>> {
    const daemonStatuses = await daemonManagementService.getAllDaemonStatuses(false);
    for (const [foundConnectionId, result] of daemonStatuses) {
        if (foundConnectionId === connectionId && result.type === 'daemon_is_running') {
            return result;
        }
    }
    return undefined;
}

/**
 * Finds the first running daemon that matches the specified search predicate.
 * @param daemonManagementService Daemon management service
 * @param searchPredicate Search predicate to find a matching daemon
 * @returns If a matching daemon is found, returns DaemonIsRunningStatus.
 * Otherwise, returns undefined if no matching daeamon can be found.
 */
export async function findRunningDaemonWithPredicate<T extends DaemonConfig>(
    daemonManagementService: IDaemonStatusRetriever<T>,
    searchPredicate: (status: DaemonIsRunningStatus<T>) => boolean
): Promise<DaemonIsRunningStatus<T>> {
    const runningDaemons = await getAllRunningDaemons(daemonManagementService);
    return runningDaemons.find(searchPredicate);
}

/**
 * Find all running daemons
 * @param daemonManagementService Daemon management service
 * @returns List of running daemons
 */
export async function getAllRunningDaemons<T extends DaemonConfig>(
    daemonManagementService: IDaemonStatusRetriever<T>
): Promise<DaemonIsRunningStatus<T>[]> {
    const daemonStatuses = await daemonManagementService.getAllDaemonStatuses(false);
    return Array.from(daemonStatuses.values()).reduce<DaemonIsRunningStatus<T>[]>(
        (acc, status) => status.type === 'daemon_is_running' ? [...acc, status] : acc, []
    );
}