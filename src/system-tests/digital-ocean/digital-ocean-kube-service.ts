import { Retrier } from '@jsier/retrier';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { ClusterTargetStatusPollError, CreateNewKubeClusterParameters, DigitalOceanRegistryCredentials, RegisteredDigitalOceanKubernetesCluster } from 'system-tests/digital-ocean/digital-ocean-kube.service.types';
import { checkAllSettledPromise } from 'system-tests/tests/utils/utils';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { KubeHttpService } from 'http-services/targets/kube/kube.http-services';
import { KubeClusterSummary } from 'webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';
import { createApiClient } from 'dots-wrapper';
import { ICreateKubernetesClusterNodePoolApiRequest, IKubernetesCluster } from 'dots-wrapper/dist/kubernetes';

// Default expiration for Kubernetes and Docker credentials retrieved from
// DigitalOcean
const DO_CLUSTER_EXPIRY_SECONDS: number = 3600 * 2; // 2 hours

export class DigitalOceanKubeService {
    private doClient;
    private kubeHttpService: KubeHttpService;
    private policyHttpService: PolicyHttpService;
    private envHttpService: EnvironmentHttpService;

    constructor(
        apiToken: string,
        private configService: ConfigService,
        private logger: Logger
    ) {
        this.doClient = createApiClient({ token: apiToken });
        this.kubeHttpService = new KubeHttpService(this.configService, this.logger);
        this.policyHttpService = new PolicyHttpService(this.configService, this.logger);
        this.envHttpService = new EnvironmentHttpService(this.configService, this.logger);
    }

    /**
     * Create a DigitalOcean cluster.
     * @returns Information about the created cluster
     */
    public async createDigitalOceanKubeCluster(parameters: CreateNewKubeClusterParameters): Promise<IKubernetesCluster> {
        // Try 3 times with a delay of 10 seconds between each attempt.
        const retrier = new Retrier({
            limit: 3,
            delay: 1000 * 10
        });

        const cluster: IKubernetesCluster = await retrier.resolve((attempt) => {
            this.logger.info(`Attempt ${attempt} creating kube cluster ${parameters.clusterName}`);
            return this.createNewCluster(parameters);
        });

        return cluster;
    }

    /**
     * Get the kubeconfig file for a DigitalOcean Kubernetes cluster
     * @param cluster The DigitalOcean cluster
     * @param expirySeconds Optional. Number of seconds until the credentials expire.
     * @returns String that should be stored in a kubeconfig file
     */
    public async getClusterKubeConfig(cluster: IKubernetesCluster, expirySeconds: number = DO_CLUSTER_EXPIRY_SECONDS): Promise<string> {
        // Try 3 times with a delay of 10 seconds between each attempt.
        const retrier = new Retrier({
            limit: 3,
            delay: 1000 * 10
        });

        const kubeConfig: string = await retrier.resolve(async (attempt) => {
            this.logger.info(`Attempt ${attempt} getting kube config for cluster ${cluster.name}`);
            const kubeConfigDataResp = await this.doClient.kubernetes.getKubernetesClusterKubeconfig({ kubernetes_cluster_id: cluster.id, expiration_in_seconds: expirySeconds });
            return kubeConfigDataResp.data;
        });

        return kubeConfig;
    }

    /**
     * Get registry credentials for our DigitalOcean Docker registry
     * @param expirySeconds Optional. Number of seconds until the credentials expire.
     * @returns
     */
    public async getDigitalOceanContainerRegistryCredentials(expirySeconds: number = DO_CLUSTER_EXPIRY_SECONDS): Promise<DigitalOceanRegistryCredentials> {
        const getDockerCredentialsResp = await this.doClient.containerRegistry.getDockerCredentials({ can_write: false, expiry_seconds: expirySeconds });
        return getDockerCredentialsResp.data;
    }

    /**
     * Cleans up a DigitalOcean cluster by deleting the cluster target on
     * BastionZero
     * @param registeredCluster The registered DigitalOcean cluster to clean up
     * @returns A promise that represents the results of deleting the cluster on
     * BastionZero
     */
    public async deleteRegisteredKubernetesCluster(
        registeredCluster: RegisteredDigitalOceanKubernetesCluster
    ): Promise<void> {

        const cleanupPromises = [];

        // NOTE: If cluster delete call fails, then there will also be an
        // extraneous env
        cleanupPromises.push(this.deleteKubeClusterTarget(registeredCluster));

        // Always attempt to delete the policy for this cluster. It is possible
        // for the policy not to exist (e.g. something broke in helm).
        cleanupPromises.push(this.deleteClusterPolicy(registeredCluster));

        await checkAllSettledPromise(Promise.allSettled(cleanupPromises));
    }

    private async deleteKubeClusterTarget(registeredCluster: RegisteredDigitalOceanKubernetesCluster): Promise<void> {

        // Only delete cluster target on BastionZero if it is set.
        // Delete env as well but only after deleting cluster
        if (registeredCluster.bzeroClusterTargetSummary) {
            await this.kubeHttpService.DeleteKubeCluster(registeredCluster.bzeroClusterTargetSummary.id);
        }
    }

    private async deleteClusterPolicy(registeredCluster: RegisteredDigitalOceanKubernetesCluster): Promise<void> {
        // Find the policy that Helm creates and delete it
        const policyName = this.getHelmClusterPolicyName(registeredCluster.bzeroClusterTargetSummary.name);
        const kubernetesPolicies = await this.policyHttpService.ListKubernetesPolicies();
        const kubernetesPolicy = kubernetesPolicies.find(p => p.name === policyName);
        if (kubernetesPolicy) {
            await this.policyHttpService.DeleteKubernetesPolicy(kubernetesPolicy.id);
        } else {
            throw new Error(`Unexpected error! Expected to find at least one policy with name: ${policyName}`);
        }
    }

    /**
     * Polls the bastion until the Cluster target is Online.
     * @param clusterTargetName The name of the cluster target to poll
     * @returns Information about the cluster
     */
    public async pollClusterTargetOnline(clusterTargetName: string): Promise<KubeClusterSummary> {
        // Try 60 times with a delay of 10 seconds between each attempt.
        const retrier = new Retrier({
            limit: 60,
            delay: 1000 * 10,
            stopRetryingIf: (reason: any) => reason instanceof ClusterTargetStatusPollError && reason.clusterSummary.status === TargetStatus.Error
        });

        // We don't know Cluster target ID initially
        let clusterTargetId: string = '';
        return retrier.resolve(() => new Promise<KubeClusterSummary>(async (resolve, reject) => {
            const checkIsClusterTargetOnline = (clusterSummary: KubeClusterSummary) => {
                if (clusterSummary.status === TargetStatus.Online) {
                    resolve(clusterSummary);
                } else {
                    throw new ClusterTargetStatusPollError(clusterSummary, `Cluster target ${clusterSummary.name} is not online. Has status: ${clusterSummary.status}`);
                }
            };
            try {
                if (clusterTargetId === '') {
                    // We don't know the cluster target ID yet, so we have to
                    // use the less efficient list API to learn about the ID
                    const clusters = await this.kubeHttpService.ListKubeClusters();
                    const foundTarget = clusters.find(target => target.name === clusterTargetName);
                    if (foundTarget) {
                        clusterTargetId = foundTarget.id;
                        checkIsClusterTargetOnline(foundTarget);
                    } else {
                        throw new Error(`Cluster target with name ${clusterTargetName} does not exist`);
                    }
                } else {
                    // Cluster target ID is known
                    const target = await this.kubeHttpService.GetKubeCluster(clusterTargetId);
                    checkIsClusterTargetOnline(target);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Polls DigitalOcean's GET Kubernetes cluster API until it says the
     * provided cluster has status == "running".
     * @param cluster Cluster to query
     * @returns Cluster information after its status == "running"
     */
    public async pollClusterRunning(cluster: IKubernetesCluster): Promise<IKubernetesCluster> {
        // Try 90 times with a delay of 10 seconds between each attempt (total 15 min).
        // Average ETA: 5-10 minutes to provision
        const retrier = new Retrier({
            limit: 90,
            delay: 1000 * 10
        });

        return retrier.resolve(() => new Promise<IKubernetesCluster>(async (resolve, reject) => {
            try {
                // A status string indicating the state of the cluster instance.
                // This may be: "running", "provisioning", "degraded" "error",
                // "deleted", "upgrading" or "deleting". Source:
                // https://docs.digitalocean.com/reference/api/api-reference/#operation/get_kubernetes_cluster
                const retrievedCluster = (await this.doClient.kubernetes.getKubernetesCluster({kubernetes_cluster_id: cluster.id})).data.kubernetes_cluster;
                if (retrievedCluster.status.state === 'running') {
                    resolve(retrievedCluster);
                } else {
                    throw new Error(`Cluster is not running. Has status: ${retrievedCluster.status.state}`);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Helper function to get digital ocean cluster info from a given clusterId
     * @param clusterId Cluster Id to get the config for
     * @returns DO Cluster config info
     */
    public async getDigitalOceanClusterById(clusterId: string): Promise<IKubernetesCluster> {
        const getClusterResp = await this.doClient.kubernetes.getKubernetesCluster({ kubernetes_cluster_id: clusterId});
        return getClusterResp.data.kubernetes_cluster;
    }

    /**
     * Create a new Kubernetes cluster
     * @param parameters Parameters to use when creating the cluster
     * @returns Information about the newly created cluster
     */
    private async createNewCluster(
        parameters: CreateNewKubeClusterParameters
    ): Promise<IKubernetesCluster> {
        const request = {
            name: parameters.clusterName,
            region: parameters.clusterRegion,
            version: parameters.clusterVersion,
            tags: parameters.clusterTags,
            node_pools: parameters.clusterNodePools.map<ICreateKubernetesClusterNodePoolApiRequest>(w => {
                const apiWorkerNodePool: ICreateKubernetesClusterNodePoolApiRequest = {
                    size: w.workerDropletSize,
                    name: w.nodePoolName,
                    count: w.dropletInstancesCount,
                    tags: w.workerNodeTags,
                };

                if (w.autoScaleParameters) {
                    apiWorkerNodePool.auto_scale = true;
                    apiWorkerNodePool.min_nodes = (w.autoScaleParameters.minNodes ? w.autoScaleParameters.minNodes : 1);
                    apiWorkerNodePool.max_nodes = w.autoScaleParameters.maxNodes;
                }

                return apiWorkerNodePool;
            })
        };

        const createClusterResp = await this.doClient.kubernetes.createKubernetesCluster(request);
        return createClusterResp.data.kubernetes_cluster;
    }

    /**
     * Returns the policy name created by helm for a new cluster
     * @param clusterName
     * @returns The policy name
     */
    private getHelmClusterPolicyName(clusterName: string): string {
        return `${clusterName}-policy`;
    }
}
