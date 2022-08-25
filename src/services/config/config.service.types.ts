export type DaemonConfigs<T extends DaemonConfig> = { [connectionId: string]: T };

export const DaemonConfigType = {
    Db: 'db',
    Kube: 'kube',
    Web: 'web'
} as const;
export type DaemonConfigType = typeof DaemonConfigType[keyof typeof DaemonConfigType];

export type DaemonConfig =
    | WebConfig
    | DbConfig
    | KubeConfig;

interface BaseDaemonConfig {
    type: DaemonConfigType,
    localHost: string,
    localPort: number,
    localPid: number,
}

export interface WebConfig extends BaseDaemonConfig {
    type: 'web',
    name: string,
}

export interface DbConfig extends BaseDaemonConfig {
    type: 'db',
    name: string,
}

export interface KubeConfig extends BaseDaemonConfig {
    type: 'kube',
    keyPath: string,
    certPath: string,
    csrPath: string,
    token: string,
    targetUser: string,
    targetGroups: string[],
    targetCluster: string,
    defaultTargetGroups: string[]
}

export function getDefaultKubeConfig(): KubeConfig {
    return {
        type: 'kube',
        keyPath: null,
        certPath: null,
        csrPath: null,
        token: null,
        localHost: null,
        localPort: null,
        localPid: null,
        targetUser: null,
        targetGroups: null,
        targetCluster: null,
        defaultTargetGroups: null,
    };
}

export function getDefaultDbConfig(): DbConfig {
    return {
        type: 'db',
        name: null,
        localHost: null,
        localPort: null,
        localPid: null
    };
}

export function getDefaultWebConfig(): WebConfig {
    return {
        type: 'web',
        localHost: null,
        localPort: null,
        localPid: null,
        name: null,
    };
}