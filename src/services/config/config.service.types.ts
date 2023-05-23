export type DaemonConfigs<T extends DaemonConfig> = { [connectionId: string]: T };

export const DaemonConfigType = {
    Db: 'db',
    RDP: 'rdp',
    Kube: 'kube',
    Web: 'web'
} as const;
export type DaemonConfigType = typeof DaemonConfigType[keyof typeof DaemonConfigType];

export type DaemonConfig =
    | WebConfig
    | DbConfig
    | KubeConfig
    | RDPConfig;

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

export interface RDPConfig extends BaseDaemonConfig {
    type: 'rdp',
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
        localPid: null
    };
}

export function getDefaultRDPConfig(): RDPConfig {
    return {
        type: 'rdp',
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