import { DaemonConfig, DaemonConfigs, DaemonConfigType, DbConfig, getDefaultDbConfig } from '../config/config.service.types';
import { ProcessManagerService } from '../process-manager/process-manager.service';
import { DaemonRunningStatus, DaemonStatus } from './types/daemon-status.types';
import { DisconnectResult } from './types/disconnect-result.types';

export interface DaemonStore<T extends DaemonConfig> {
    setDaemons(daemons: DaemonConfigs<T>): void;
    getDaemons(): DaemonConfigs<T>;
}

export interface ProcessManager {
    killProcess(pid: number): void;
    isProcessRunning(pid: number): boolean;
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
 * (2) Forcibly kill the daemon.

 * (3) Provide daemon's status (e.g. daemon quit unexpectedly).
 *
 * Some type safety is achieved by mapping the JSON config type T (DaemonConfig)
 * to T2 (ManagedDaemonConfig) which is a union type that can be discriminated
 * based on the ManagedDaemonConfigType field.
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
     * Get statuses for all daemons stored in the map
     * @returns A dictionary of results where the key is the connection ID or
     * undefined if there is no connection ID stored, and the value is the
     * daemon's status.
     */
    public async getAllDaemonStatuses(): Promise<Map<string | undefined, DaemonStatus<T>>> {
        const resultMap: Map<string, DaemonStatus<T>> = new Map();
        const daemonConfigs = this.getDaemonConfigs();
        for (const [connectionId, config] of daemonConfigs) {
            if (config.localPid == null) {
                // Remove daemon from config, so we don't show it in status
                // anymore
                this.deleteDaemon(connectionId);

                // Add result to map
                resultMap.set(connectionId, { type: 'no_daemon_running', config: config });
                continue;
            } else {
                // Check if the pid is still alive
                if (!this.processManager.isProcessRunning(config.localPid)) {
                    // Remove daemon from config, so we don't show it in status
                    // anymore
                    this.deleteDaemon(connectionId);

                    // Add result to map
                    resultMap.set(connectionId, { type: 'daemon_quit_unexpectedly', config: config });
                    continue;
                }

                // Add different result to map depending on the config type
                const localUrl = `${config.localHost}:${config.localPort}`;
                switch (config.type) {
                case 'web':
                case 'db':
                    resultMap.set(connectionId, {
                        type: 'daemon_is_running',
                        config: config,
                        status: {
                            type: config.type,
                            targetName: config.name,
                            localUrl: localUrl
                        } as Extract<DaemonRunningStatus, { type: T['type'] }>
                    });
                    continue;
                case 'kube':
                    resultMap.set(connectionId, {
                        type: 'daemon_is_running',
                        config: config,
                        status: {
                            type: config.type,
                            localUrl: localUrl,
                            targetCluster: config.localHost,
                            targetUser: config.targetUser,
                            targetGroup: config.targetGroups.join(','),
                        } as Extract<DaemonRunningStatus, { type: T['type'] }>
                    });
                    continue;
                default:
                    // Compile-time exhaustive check
                    const _exhaustiveCheck: never = config;
                    throw new Error(`Unhandled case: ${_exhaustiveCheck}`);
                }
            }
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

        for (const [connectionId, daemonConfig] of daemonConfigs) {
            const localPid = daemonConfig.localPid;
            if (localPid != null) {
                // Try to kill the daemon process. Log results if killing daemon
                // fails.
                try {
                    this.processManager.killProcess(localPid);
                } catch (err: any) {
                    // If the daemon was killed or doesn't exist--just continue

                    // Still remove from the config store
                    this.deleteDaemon(connectionId);

                    // Track decision
                    resultMap.set(connectionId, {
                        type: 'daemon_fail_killed',
                        daemon: daemonConfig,
                        error: err
                    });
                    continue;
                }

                // Daemon successfully killed. Delete from the config
                this.deleteDaemon(connectionId);

                // Track decision
                resultMap.set(connectionId, {
                    type: 'daemon_success_killed',
                    daemon: daemonConfig,
                });
            }
        }

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