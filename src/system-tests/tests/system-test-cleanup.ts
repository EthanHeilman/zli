import { NewApiKeyResponse } from '../../services/v1/api-key/api-key.types';
import { apiKeyService, doKubeService, doService, policyService, testClusters, testTargets } from './system-test';
import { checkAllSettledPromise } from './utils/utils';

/**
 * Helper function to cleanup our system test api keys
 * @param systemTestRESTApiKey Rest api key
 * @param systemTestRegistrationApiKey Registration api key
 */
export async function cleanupSystemTestApiKeys(systemTestRESTApiKey: NewApiKeyResponse, systemTestRegistrationApiKey: NewApiKeyResponse) {
    await apiKeyService.DeleteApiKey(systemTestRESTApiKey.apiKeyDetails.id);
    await apiKeyService.DeleteApiKey(systemTestRegistrationApiKey.apiKeyDetails.id);
}

/**
 * Helper function to clean up our digital ocean test cluster
 */
export async function cleanupDOTestClusters() {
    const allClustersCleanup = Promise.allSettled(Array.from(testClusters.values()).map(doCluster => {
        return doKubeService.deleteRegisteredKubernetesCluster(doCluster);
    }));

    await checkAllSettledPromise(allClustersCleanup);
}

/**
 * Helper function to clean up our digital ocean test targets
 */
export async function cleanupDOTestTargets() {
    const allTargetsCleanup = Promise.allSettled(Array.from(testTargets.values()).map((doTarget) => {
        return doService.deleteDigitalOceanTarget(doTarget);
    }));

    await checkAllSettledPromise(allTargetsCleanup);
}

/**
 * Helper fukction to clean up a target connect policies for a given name
 * @param policyName Policy name to delete
 */
export async function cleanupTargetConnectPolicies(policyName: string) {
    const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
    const targetConnectPolicy = targetConnectPolicies.find(policy =>
        policy.name == policyName
    );
    await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);
}