export interface KubeConfig {
    keyPath: string,
    certPath: string,
    csrPath: string,
    token: string,
    localHost: string,
    localPort: number,
    localPid: number,
    targetUser: string,
    targetGroups: string[],
    targetCluster: string,
    defaultTargetGroups: string[]
}

export function getDefaultKubeConfig(): KubeConfig {
    return {
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