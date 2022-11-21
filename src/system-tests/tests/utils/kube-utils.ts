import * as k8s from '@kubernetes/client-node';
import { KubeConfig } from '@kubernetes/client-node';
import { Logger } from '../../../services/logger/logger.service';

export async function execOnPod(k8sExec: k8s.Exec, pod: k8s.V1Pod, containerName: string, command: string | string[], logger: Logger) {
    if(! pod || !pod.metadata || !pod.metadata.name || !pod.metadata.namespace) {
        throw Error(`Cannot exec on pod without name/namespace metadata: ${JSON.stringify(pod, null, 2)}`);
    }

    return new Promise<void>(async (res, rej) => {

        try {
            await k8sExec.exec(
                pod.metadata.namespace, pod.metadata.name, containerName, command, process.stdout, process.stderr, null, false,
                (status: k8s.V1Status) => {
                    logger.info(`Kube exec command "${command}": exited with status: ${JSON.stringify(status, null, 2)}`);
                    res();
                }
            );
        } catch(err) {
            rej(err);
        }
    });

}

// This function should be called after calling zli connect
export function getKubeConfig(): KubeConfig {
    const kc = new k8s.KubeConfig();
    // Should see custom envvar for KUBECONFIG
    kc.loadFromDefault();
    return kc;
};

export async function deletePod(k8sApi: k8s.CoreV1Api, pod: k8s.V1Pod) {
    if(! pod || !pod.metadata || !pod.metadata.name || !pod.metadata.namespace) {
        throw Error(`Cannot delete pod without name/namespace metadata: ${JSON.stringify(pod, null, 2)}`);
    }

    k8sApi.deleteNamespacedPod(pod.metadata.name, pod.metadata.namespace);
}

export async function getPodWithLabelSelector(k8sApi: k8s.CoreV1Api, namespace: string, labelSelector: {[key: string]: string}) {
    const labelSelectorString = Object.keys(labelSelector).map(k => `${k}=${labelSelector[k]}`).join(',');
    return k8sApi.listNamespacedPod(namespace, undefined, undefined, undefined, undefined, labelSelectorString);
}