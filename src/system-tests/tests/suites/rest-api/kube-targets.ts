import { KubeHttpService } from 'http-services/targets/kube/kube.http-services';
import { configService, logger, testCluster } from 'system-tests/tests/system-test';

export const kubeClusterRestApiSuite = () => {
    describe('Kubernetes Cluster REST API Suite', () => {
        let kubeClusterService: KubeHttpService;

        beforeAll(async () => {
            kubeClusterService = await KubeHttpService.init(configService, logger);
        });

        test('11471: Get a Kubernetes cluster by ID', async () => {
            const kubeClusterSummary = await kubeClusterService.GetKubeCluster(testCluster.bzeroClusterTargetSummary.id);
            expect(kubeClusterSummary).toBeDefined();
            expect(kubeClusterSummary.id).toEqual(testCluster.bzeroClusterTargetSummary.id);
        }, 15 * 1000);

        test('11500: Get all Kubernetes clusters', async () => {
            const kubeClusterSummaries = await kubeClusterService.ListKubeClusters();
            const filteredClusters = kubeClusterSummaries.filter(cluster => cluster.id === testCluster.bzeroClusterTargetSummary.id);
            expect(filteredClusters.length).toBe(1);
        }, 15 * 1000);

        test('11501: Edit a Kubernetes cluster', async () => {
            let kubeClusterSummary = await kubeClusterService.GetKubeCluster(testCluster.bzeroClusterTargetSummary.id);
            const originalName = kubeClusterSummary.name;
            const changedName = `${originalName}-changed`;
            await kubeClusterService.EditKubeCluster(testCluster.bzeroClusterTargetSummary.id, {
                name: changedName
            });
            kubeClusterSummary = await kubeClusterService.GetKubeCluster(testCluster.bzeroClusterTargetSummary.id);
            expect(kubeClusterSummary.name).toEqual(changedName);

            // change the name back to the original name in case other tests or tools rely on the name
            await kubeClusterService.EditKubeCluster(testCluster.bzeroClusterTargetSummary.id, {
                name: originalName
            });
        }, 15 * 1000);
    });
};