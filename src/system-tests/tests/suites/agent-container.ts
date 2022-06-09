import { configService, doApiKey, logger, loggerConfigService, resourceNamePrefix, systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestRegistrationApiKey, systemTestUniqueId } from '../system-test';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { ConnectTestUtils } from '../utils/connect-utils';
import { SessionRecordingPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { SessionRecordingHttpService } from '../../../http-services/session-recording/session-recording.http-services';
import { BzeroAgentSummary } from '../../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import * as k8s from '@kubernetes/client-node';
import { agentContainersToRun } from '../../tests/targets-to-run';
import { checkAllSettledPromise } from '../utils/utils';
import { systemTestDigitalOceanClusterId } from '../system-test-setup';
import { DigitalOceanSSMTargetService } from '../../digital-ocean/digital-ocean-ssm-target-service';
import { DigitalOceanKubeService } from '../../digital-ocean/digital-ocean-kube-service';
import { BzeroTargetStatusPollError } from '../../digital-ocean/digital-ocean-ssm-target.service.types';

/**
 * Represents a BZero target hosted on a specific cluster
 */
export type ContainerBzeroTarget = {
    type: 'container-bzero';
    bzeroTarget: BzeroAgentSummary;
    awsRegion: string;
    podInfo: k8s.V1Pod;
};

/**
 * BzeroContainerTestTarget represents a bzero test target installed on a pod via
 * a container
 */
export type BzeroContainerTestTarget = {
    installType: 'pm-pod';
    type: string;

    shellAndRecordCaseID?: string;
}

export const agentContainerSuite = () => {
    describe('Agent Container suite', () => {
        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;
        let testPassed = false;
        let sessionRecordingPolicy: SessionRecordingPolicySummary;
        let sessionRecordingService: SessionRecordingHttpService;
        let testContainerAgents = new Map<BzeroContainerTestTarget, ContainerBzeroTarget >();


        // Set up the policy before all the tests
        beforeAll(async () => {
            testContainerAgents = await setupAgentContainer(agentContainersToRun);

            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);
            sessionRecordingService = new SessionRecordingHttpService(configService, logger);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // Then create our targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'container-target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target connect policy created via containers for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{userName: 'root'}],
                verbs: [{type: VerbType.Shell},]
            });

            // Also create our session recording policy
            sessionRecordingPolicy = await policyService.AddSessionRecordingPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'session-recording'),
                groups: [],
                subjects: [
                    currentUser
                ],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                recordInput: false
            });
        }, 60 * 1000 * 10);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Clean up our agent test targets
            cleanupAgentContainer(testContainerAgents);


            await Promise.allSettled([
                await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'container-target-connect')),
                policyService.DeleteSessionRecordingPolicy(sessionRecordingPolicy.id),
            ]);
        }, 60 * 1000 * 10);

        // Called before each case
        beforeEach(() => {
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
        });

        // Called after each case
        afterEach(async () => {
            await connectTestUtils.cleanup();

            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);
            testPassed = false;
        });

        agentContainersToRun.forEach(async (targetInfo) => {
            // Get the associated targetInfo
            // Skip agent-container tests until https://commonwealthcrypto.atlassian.net/browse/CWC-1921 is resolved
            test.skip(`${targetInfo.shellAndRecordCaseID}: agent container - container connect - ${targetInfo.type}`, async () => {
                const testTarget = testContainerAgents.get(targetInfo);

                const sessionRecordingTestMessage = `session recording test - ${systemTestUniqueId}`;
                const connectionId = await connectTestUtils.runNonTestTargetShellConnectTest(testTarget, sessionRecordingTestMessage, true);

                // Get session recording and verify the echo'd message is in the asciicast data.
                const downloadedSessionRecording = await sessionRecordingService.GetSessionRecording(connectionId);
                const messageFound = downloadedSessionRecording.includes(sessionRecordingTestMessage);
                expect(messageFound).toEqual(true);

                testPassed = true;
            }, 2 * 60 * 1000);
        });
    });
};

/**
 * Helper function to create our agent container pod + targets
 * @returns List of agent container targets
 */
export async function setupAgentContainer(targetsToRun: BzeroContainerTestTarget[]): Promise<Map<BzeroContainerTestTarget, ContainerBzeroTarget >> {
    // Gets cluster information for our static DO cluster
    const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);

    // To poll to ensure the agent is online
    const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);

    const toReturn = new Map<BzeroContainerTestTarget, ContainerBzeroTarget >();

    const createContainer = async (target: BzeroContainerTestTarget) => {
        // First get the image URL that we have built
        let imageUrl : string = undefined;
        switch (target.type) {
        case 'al2':
            imageUrl = 'registry.digitalocean.com/bastionzero-do/agent-container-al2:latest';
            break;
        case 'ubuntu':
            imageUrl = 'registry.digitalocean.com/bastionzero-do/agent-container-ubuntu:latest';
            break;
        default:
            throw new Error(`Unhandled type passed: ${target.type}`);
        }

        // Get the config file
        const cluster = await doKubeService.getDigitalOceanClusterById(systemTestDigitalOceanClusterId);
        const kubeConfigFileContents = await doKubeService.getClusterKubeConfig(cluster);

        // Init Kube client
        const kc = new k8s.KubeConfig();
        kc.loadFromString(kubeConfigFileContents);
        const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

        const targetName = `agent-container-${target.type}-${resourceNamePrefix}`;

        // Create a pod
        const pod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: targetName
            } as k8s.V1ObjectMeta,
            spec: {
                containers: [
                    {
                        name: 'agent',
                        image: imageUrl,
                        imagePullPolicy: 'Always',
                        env: [
                            {
                                name: 'REGISTRATION_KEY',
                                value: systemTestRegistrationApiKey.secret
                            } as k8s.V1EnvVar,
                            {
                                name: 'TARGET_NAME',
                                value: targetName
                            } as k8s.V1EnvVar,
                            {
                                name: 'SERVICE_URL',
                                value: configService.serviceUrl()
                            } as k8s.V1EnvVar,
                            {
                                name: 'ENVIRONMENT_NAME',
                                value: systemTestEnvName
                            }
                        ],
                    } as k8s.V1Container
                ],
                imagePullSecrets: [ {
                    name: 'do-registry'
                } as k8s.V1LocalObjectReference ]
            } as k8s.V1PodSpec
        } as k8s.V1Pod;
        // Create our pod in the default namespace (the do secret has been uploaded to the default
        // namespace in order to allow custom images to be pulled)
        try  {
            await k8sApi.createNamespacedPod('default', pod);
        } catch (err) {
            logger.error(`Error creating pod: ${pod.metadata.name}: ${err}`);
            throw err;
        }

        // Set the bzero container associated with this digital ocean droplet
        const bzeroContainerTestTarget: ContainerBzeroTarget = {
            type: 'container-bzero',
            bzeroTarget: undefined,
            awsRegion: undefined,
            podInfo: pod,
        };

        try {
            const containerAgentTarget = await doService.pollBZeroTargetOnline(targetName);
            bzeroContainerTestTarget.awsRegion = containerAgentTarget.region;
            bzeroContainerTestTarget.bzeroTarget = containerAgentTarget;

            toReturn.set(target, bzeroContainerTestTarget);

            console.log(
                `Successfully created ContainerAgent:
                \tAWS region: ${containerAgentTarget.region}
                \tInstall Type: ${target.type}
                \tSSM Target ID: ${containerAgentTarget.id}`
            );
        } catch (err) {
            // Catch special exception so that we can save bzeroTarget reference
            // for cleanup.
            //
            // BzeroTargetStatusPollError is thrown if target reaches 'Error'
            // state, or if target is known but does not come online within the
            // specified timeout.
            if (err instanceof BzeroTargetStatusPollError) {
                bzeroContainerTestTarget.bzeroTarget = err.bzeroTarget;
            }

            // Still throw the error because something failed. No other system
            // tests should continue if one target fails to become Online.
            throw err;
        }
    };

    // Issue create droplet requests concurrently
    const allPodsCreationResults = Promise.allSettled(targetsToRun.map(img => createContainer(img)));
    await checkAllSettledPromise(allPodsCreationResults);

    return toReturn;
}

/**
 * Helper function to clean up our container agents
 * @param testContainerAgents List of container agents that we have created
 */
async function cleanupAgentContainer(testContainerAgents: Map<BzeroContainerTestTarget, ContainerBzeroTarget >) {
    // Loop over each test container agent
    const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);
    const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);
    testContainerAgents.forEach(async (targetInfo, _) => {
        await doService.deleteBzeroTarget(targetInfo.bzeroTarget.id);

        // Get the config file
        const cluster = await doKubeService.getDigitalOceanClusterById(systemTestDigitalOceanClusterId);
        const kubeConfigFileContents = await doKubeService.getClusterKubeConfig(cluster);

        // Init Kube client
        const kc = new k8s.KubeConfig();
        kc.loadFromString(kubeConfigFileContents);
        const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

        // Delete the pod
        try {
            await k8sApi.deleteNamespacedPod(targetInfo.podInfo.metadata.name, 'default');
        } catch (err) {
            logger.error(`Error deleting pod: ${targetInfo.podInfo.metadata.name}! ${err}`);
        }
    });
}