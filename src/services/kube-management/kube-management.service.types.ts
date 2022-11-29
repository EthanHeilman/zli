import { KubeConfig } from '@kubernetes/client-node';

export interface FilterKubeConfigResult {
    filteredKubeConfig: KubeConfig;
    removedKubeContexts: string[];
    removedKubeClusters: string[];
    isDirty: boolean;
}

export interface UserKubeConfig {
    filePath: string;
    kubeConfig: KubeConfig;
}