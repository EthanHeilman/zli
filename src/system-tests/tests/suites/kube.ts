import * as k8s from '@kubernetes/client-node';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import { callZli } from '../utils/zli-utils';
import { HttpError } from '@kubernetes/client-node';
import { clusterVersionsToRun, loggerConfigService, testClusters } from '../system-test';
import { configService, logger } from '../system-test';
import { TestUtils } from '../utils/test-utils';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';

const fs = require('fs');

export const KubeTestUserName = 'foo';
const BadKubeTestUserName = 'baduser'
export const KubeTestTargetGroups = ['system:masters', 'foo'];
export const KubeBctlNamespace = 'bastionzero';

export const kubeSuite = () => {
    describe('kube suite', () => {
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;

        let testPassed = false;
        const kubeConfigYamlFilePath = '/tmp/bzero-agent-kubeconfig.yml';

        beforeAll(() => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);
        });

        beforeEach(() => {
            jest.restoreAllMocks();
            jest.clearAllMocks();
        });

        afterEach(async () => {
            // Always disconnect
            await callZli(['disconnect']);

            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);

            // Always make sure our ports are free, else throw an error
            const kubeConfig = configService.getKubeConfig();
            if (kubeConfig.localPort !== null) {
                await testUtils.CheckPort(kubeConfig.localPort);
            }

            // Reset test passed
            testPassed = false;
        }, 15 * 1000);

        test.each(clusterVersionsToRun)('2159: zli generate kubeConfig %p', async (_) => {
            // Generate the kubeConfig YAML and write to a file to be read by
            // the kubectl ts library
            await callZli(['generate', 'kubeConfig', '-o', kubeConfigYamlFilePath]);

            // Now ensure that the file exists
            expect(fs.existsSync(kubeConfigYamlFilePath));
        });

        test.each(clusterVersionsToRun)('2160: zli connect - Kube REST API plugin - Delete agent pod - %p', async (clusterVersion) => {
            const doCluster = testClusters.get(clusterVersion);

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            // Start tunnel as system master so we can actually make a request
            // If we add multiple groups, we will not be able to execute the
            // request: Ref: https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-whether-a-request-is-allowed-or-denied
            let targetGroupArgs: string[] = ['--targetGroup', 'system:masters'];
            let finalArgs: string[] = ['connect', `${KubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            finalArgs = finalArgs.concat(targetGroupArgs);
            await callZli(finalArgs);

            // Ensure the created and connected event exist
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.Created));
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.ClientConnect));

            // Delete the agent pod
            let podName = 'wrongname'
            try {
                const listPodsResp = await k8sApi.listNamespacedPod('bastionzero');
                const listPodsParsed = listPodsResp.body;

                // There should only be 1 pod in the bastionzero namespace
                podName = listPodsParsed.items[0].metadata.name;
                await k8sApi.deleteNamespacedPod(podName, 'bastionzero');
            } catch (err) {
                // Pretty print Kube API error
                if (err instanceof HttpError) {
                    console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                }
                throw err;
            }

            // Disconnect
            await callZli(['disconnect', 'kube']);

            // Ensure that the disconnect and close events exist
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.ClientDisconnect));
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.Closed));

            // Ensure that we see a log of this under the kube logs
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', ['/api/v1/namespaces/bastionzero/pods'], []));
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', [`/api/v1/namespaces/bastionzero/pods/${podName}`], []));
            
            // For the next 3 minutes, the agent should remain online, the next test will ensure we can still connect 
            await delay(1000 * 3 * 60)

            testPassed = true;
        }, (180 * 1000) + (1000 * 3 * 60)); // 180s max for all the kube events + connection, and 3m for the test to remain online


        test.each(clusterVersionsToRun)('2160: zli connect - Kube REST API plugin - get namespaces - %p', async (clusterVersion) => {
            const doCluster = testClusters.get(clusterVersion);

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            // Start tunnel as system master so we can actually make a request
            // If we add multiple groups, we will not be able to execute the
            // request: Ref: https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-whether-a-request-is-allowed-or-denied
            let targetGroupArgs: string[] = [];
            KubeTestTargetGroups.forEach(tg => {
                if (tg == 'system:masters') {
                    const newArgs = ['--targetGroup', tg];
                    targetGroupArgs = targetGroupArgs.concat(newArgs);
                }
            });
            let finalArgs: string[] = ['connect', `${KubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            finalArgs = finalArgs.concat(targetGroupArgs);
            await callZli(finalArgs);

            // Ensure the created and connected event exist
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.Created));
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.ClientConnect));

            // Attempt to list namespaces using agent
            try {
                const listNamespaceResp = await k8sApi.listNamespace();
                const resp = listNamespaceResp.body;

                // Assert that KubeBctlNamespace namespace (created by helm quickstart) exists
                expect(resp.items.find(t => t.metadata.name === KubeBctlNamespace)).toBeTruthy();
            } catch (err) {
                // Pretty print Kube API error
                if (err instanceof HttpError) {
                    console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                }
                throw err;
            }

            // Disconnect
            await callZli(['disconnect', 'kube']);

            // Ensure that the disconnect and close events exist
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.ClientDisconnect));
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.Closed));

            // Ensure that we see a log of this under the kube logs
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, ['system:masters'], 'N/A', ['/api/v1/namespaces'], []));
            testPassed = true;
        }, 30 * 1000);

        test.each(clusterVersionsToRun)('2160: zli connect bad user - Kube REST API plugin - get namespaces - %p', async (clusterVersion) => {
            const doCluster = testClusters.get(clusterVersion);

            let finalArgs: string[] = ['connect', `${BadKubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            var callZliPromise =  callZli(finalArgs); // expect this to exit with exit code 1

            const expectedErrorMessage = 'Expected error'
            jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                throw new Error(expectedErrorMessage)
            });

            await expect(callZliPromise).rejects.toThrow(expectedErrorMessage);

            testPassed = true;
        }, 30 * 1000);

        test.each(clusterVersionsToRun)('2161: zli connect - Kube REST API plugin - multiple groups - %p', async (clusterVersion) => {
            const doCluster = testClusters.get(clusterVersion);

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            let targetGroupArgs: string[] = [];
            KubeTestTargetGroups.forEach(tg => {
                const newArgs = ['--targetGroup', tg];
                targetGroupArgs = targetGroupArgs.concat(newArgs);
            });
            let finalArgs: string[] = ['connect', `${KubeTestUserName}@${doCluster.bzeroClusterTargetSummary.name}`];
            finalArgs = finalArgs.concat(targetGroupArgs);
            await callZli(finalArgs);

            // Ensure the created and connected event exist
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id, doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.Created));
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id,  doCluster.bzeroClusterTargetSummary.name, KubeTestUserName,'CLUSTER', ConnectionEventType.ClientConnect));

            // Attempt to list namespaces using agent
            try {
                const listNamespaceResp = await k8sApi.listNamespace();
                const resp = listNamespaceResp.body;
                // Since we expect the request to be rejected, ensure that we have no response
                expect(resp.items == undefined);
            } catch (err) {
                // Pretty print Kube API error
                if (err instanceof HttpError) {
                    console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                }
                throw err;
            }

            // Disconnect
            await callZli(['disconnect', 'kube']);

            // Ensure that the disconnect and close events exist
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id,  doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.ClientDisconnect));
            expect(await testUtils.EnsureConnectionEventCreated(doCluster.bzeroClusterTargetSummary.id,  doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, 'CLUSTER', ConnectionEventType.Closed));

            // Ensure that we see a log of this under the kube logs
            expect(await testUtils.EnsureKubeEvent(doCluster.bzeroClusterTargetSummary.name, KubeTestUserName, KubeTestTargetGroups, 'N/A', ['/api/v1/namespaces'], []));
            testPassed = true;
        }, 30 * 1000);

        test.each(clusterVersionsToRun)('2162: zli targetuser - add target user to policy %p', async (clusterVersion) => {
            // Grab our cluster information and set up our spy
            const doCluster = testClusters.get(clusterVersion);

            // Call the target group function
            await callZli(['targetuser', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'someuser', '-a']);

            // Ensure we see the targetUser in the backend
            const policies = await policyService.ListKubernetesPolicies();
            expect(policies.find(policy => {
                if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                    if ('someuser' in policy.clusterUsers) {
                        return true;
                    }
                }
            }));
            testPassed = true;
        }, 30 * 1000);

        test.each(clusterVersionsToRun)('2163: zli targetuser - delete target user from policy %p', async (clusterVersion) => {
            // Grab our cluster information and set up our spy
            const doCluster = testClusters.get(clusterVersion);

            // Call the target group function
            await callZli(['targetuser', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'someuser', '-d']);

            // Ensure we see the targetUser in the backend
            const policies = await policyService.ListKubernetesPolicies();
            expect(policies.find(policy => {
                if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                    if ('someuser' in policy.clusterUsers) {
                        return true;
                    }
                }
            }) === undefined);
            testPassed = true;
        }, 30 * 1000);

        test.each(clusterVersionsToRun)('2164: zli targetgroup - add target group to policy %p', async (clusterVersion) => {
            // Grab our cluster information and set up our spy
            const doCluster = testClusters.get(clusterVersion);

            // Call the target group function
            await callZli(['targetgroup', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'somegroup', '-a']);

            // Ensure we see the targetUser in the backend
            const policies = await policyService.ListKubernetesPolicies();
            expect(policies.find(policy => {
                if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                    if ('somegroup' in policy.clusterGroups) {
                        return true;
                    }
                }
            }));
            testPassed = true;
        }, 30 * 1000);

        test.each(clusterVersionsToRun)('2165: zli targetgroup - delete target group from policy %p', async (clusterVersion) => {
            // Grab our cluster information and set up our spy
            const doCluster = testClusters.get(clusterVersion);

            // Call the target group function
            await callZli(['targetgroup', `${doCluster.bzeroClusterTargetSummary.name}-policy`, 'somegroup', '-d']);

            // Ensure we see the targetUser in the backend
            const policies = await policyService.ListKubernetesPolicies();
            expect(policies.find(policy => {
                if (policy.name == `${doCluster.bzeroClusterTargetSummary.name}-policy`) {
                    if ('somegroup' in policy.clusterGroups) {
                        return true;
                    }
                }
            }) === undefined);
            testPassed = true;
        }, 30 * 1000);
    });

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
};