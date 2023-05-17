import { DaemonConfig } from 'services/config/config.service.types';

export type DaemonStatusType = 'no_daemon_running' | 'daemon_quit_unexpectedly' | 'daemon_is_running';

export interface BaseDaemonStatus<T extends DaemonConfig> {
    config: T;
    connectionId: string | undefined;
    type: DaemonStatusType;
}

export interface NoDaemonRunningStatus<T extends DaemonConfig> extends BaseDaemonStatus<T> {
    type: 'no_daemon_running'
}

export interface DaemonQuitUnexpectedlyStatus<T extends DaemonConfig> extends BaseDaemonStatus<T> {
    type: 'daemon_quit_unexpectedly'
}

export interface DaemonIsRunningStatus<T extends DaemonConfig> extends BaseDaemonStatus<T> {
    type: 'daemon_is_running';
    status: Extract<DaemonRunningStatus, { type: T['type'] }>;
}

export type DaemonStatus<T extends DaemonConfig> =
    | NoDaemonRunningStatus<T>
    | DaemonQuitUnexpectedlyStatus<T>
    | DaemonIsRunningStatus<T>;

export interface WebDaemonRunningStatus {
    type: 'web';
    targetName: string;
    localUrl: string;
}

export interface DbDaemonRunningStatus {
    type: 'db';
    targetName: string;
    localUrl: string;
}

export interface KubeDaemonRunningStatus {
    type: 'kube';
    targetCluster: string;
    targetUser: string;
    targetGroups: string;
    localUrl: string;
}

export type DaemonRunningStatus =
    | WebDaemonRunningStatus
    | DbDaemonRunningStatus
    | KubeDaemonRunningStatus;