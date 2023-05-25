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
    controlPort: number,
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
    targetUser: string,
    targetGroups: string[],
    targetCluster: string,
    defaultNamespace?: string
}

export interface ConnectConfig {
    targetUser: string
}

export interface GlobalKubeConfig {
    securitySettings: KubeDaemonSecurityConfig
    defaultTargetGroups: string[]
}

export interface KubeDaemonSecurityConfig {
    keyPath: string,
    certPath: string,
    csrPath: string,
    token: string,
}

export function getDefaultKubeConfig(): KubeConfig {
    return {
        type: 'kube',
        localHost: null,
        localPort: null,
        localPid: null,
        controlPort: null,
        targetUser: null,
        targetGroups: null,
        targetCluster: null
    };
}

export function getDefaultDbConfig(): DbConfig {
    return {
        type: 'db',
        name: null,
        localHost: null,
        localPort: null,
        localPid: null,
        controlPort: null,
    };
}

export function getDefaultWebConfig(): WebConfig {
    return {
        type: 'web',
        localHost: null,
        localPort: null,
        localPid: null,
        name: null,
        controlPort: null,
    };
}

export function getDefaultConnectConfig(): ConnectConfig {
    return {
        targetUser: null
    };
}

export function getDefaultGlobalKubeConfig(): GlobalKubeConfig {
    return {
        securitySettings: null,
        defaultTargetGroups: null
    };
}