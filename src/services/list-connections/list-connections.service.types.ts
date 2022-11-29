export interface BaseConnectionInfo {
    connectionId: string;
    targetName: string;
    timeCreated: Date;
}

export interface DbConnectionInfo extends BaseConnectionInfo {
    type: 'db'
    remoteHost: string;
}

export interface ShellConnectionInfo extends BaseConnectionInfo {
    type: 'shell'
    targetUser: string;
}

export interface KubeConnectionInfo extends BaseConnectionInfo {
    type: 'kube';
    targetUser: string;
    targetGroups: string[];
}

export type ConnectionInfo =
| DbConnectionInfo
| ShellConnectionInfo
| KubeConnectionInfo;