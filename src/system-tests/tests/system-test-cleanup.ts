import { PolicyHttpService } from '../../http-services/policy/policy.http-services';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { DigitalOceanTargetService } from '../digital-ocean/digital-ocean-target-service';
import { configService, doApiKey, logger, testTargets } from './system-test';
import { checkAllSettledPromise } from './utils/utils';
import { uninstall } from './utils/helm/helm-utils';
import { RegisteredDigitalOceanKubernetesCluster } from '../digital-ocean/digital-ocean-kube.service.types';
import * as k8s from '@kubernetes/client-node';
import { DigitalOceanKubeService } from '../digital-ocean/digital-ocean-kube-service';
import { NewApiKeyResponse } from '../../../webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';

/**
 * Helper function to cleanup our system test api keys
 * @param systemTestRESTApiKey Rest api key
 * @param systemTestRegistrationApiKey Registration api key
 */
export async function cleanupSystemTestApiKeys(systemTestRESTApiKey: NewApiKeyResponse, systemTestRegistrationApiKey: NewApiKeyResponse) {
    const apiKeyService = new ApiKeyHttpService(configService, logger);
    await apiKeyService.DeleteApiKey(systemTestRESTApiKey.apiKeyDetails.id);
    await apiKeyService.DeleteApiKey(systemTestRegistrationApiKey.apiKeyDetails.id);
}

/**
 * Cleans up a helm installation by uninstalling the chart and deleting the
 * namespace the chart was installed in
 */
export async function cleanupHelmAgentInstallation(kubeConfigFilePath: string, helmChartName: string, helmChartNamespace: string) {
    // Uninstall the helm release
    const kubeConfigPath = kubeConfigFilePath;
    await uninstall(helmChartName, kubeConfigPath, helmChartNamespace);

    // Delete the namespace
    const kc = new k8s.KubeConfig();
    kc.loadFromFile(kubeConfigPath);
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    await k8sApi.deleteNamespace(helmChartNamespace);
}

/**
 * Helper function to clean up our digital ocean test cluster
 */
export async function cleanupDOTestCluster(cluster: RegisteredDigitalOceanKubernetesCluster) {
    // Cleanup helm chart
    await cleanupHelmAgentInstallation(cluster.kubeConfigFilePath, cluster.helmChartName, cluster.helmChartNamespace);

    // Delete the target from BastionZero
    const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);
    await doKubeService.deleteRegisteredKubernetesCluster(cluster);
}

/**
 * Helper function to clean up our digital ocean test targets
 */
export async function cleanupDOTestTargets() {
    const doService = new DigitalOceanTargetService(doApiKey, configService, logger);
    const allTargetsCleanup = Promise.allSettled(Array.from(testTargets.values()).map((doTarget) => {
        return doService.deleteDigitalOceanTarget(doTarget);
    }));

    await checkAllSettledPromise(allTargetsCleanup);
}

/**
 * Helper function to clean up a target connect policies for a given name
 * @param policyName Policy name to delete
 */
export async function cleanupTargetConnectPolicies(policyName: string) {
    const policyService = new PolicyHttpService(configService, logger);
    const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
    const targetConnectPolicy = targetConnectPolicies.find(policy =>
        policy.name == policyName
    );

    if(targetConnectPolicy) {
        await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);
    }
}