import { DaemonConfig } from '../../../services/config/config.service.types';

export type DisconnectResultType = 'daemon_success_killed' | 'daemon_fail_killed';

export interface BaseDaemonResult<T extends DaemonConfig> {
    type: DisconnectResultType;
    daemon: T;
}

export interface DaemonSuccessfullyKilled<T extends DaemonConfig> extends BaseDaemonResult<T> {
    type: 'daemon_success_killed'
}

export interface DaemonFailedToBeKilled<T extends DaemonConfig> extends BaseDaemonResult<T> {
    type: 'daemon_fail_killed';
    error: any
}

export type DisconnectResult<T extends DaemonConfig> =
    | DaemonSuccessfullyKilled<T>
    | DaemonFailedToBeKilled<T>;