export interface BaseConnectionInfo {
    connectionId: string;
    targetName: string;
    timeCreated: Date;
}

export interface DbConnectionInfo extends BaseConnectionInfo {
    type: 'db'
    remoteHost: string;
    targetUser?: string;
}

export interface RDPConnectionInfo extends BaseConnectionInfo {
    type: 'rdp'
    remoteHost: string;
}

export interface SQLServerConnectionInfo extends BaseConnectionInfo {
    type: 'sqlserver'
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
| RDPConnectionInfo
| SQLServerConnectionInfo
| ShellConnectionInfo
| KubeConnectionInfo;