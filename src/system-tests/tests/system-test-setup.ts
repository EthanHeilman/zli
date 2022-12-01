import { DigitalOceanDropletSize } from '../digital-ocean/digital-ocean.types';
import { allTargets,  bctlQuickstartVersion, chartsBranch, bzeroAgentBranch, bzeroAgentVersion, bzeroKubeAgentImageName, configService, digitalOceanRegistry, doApiKey, logger, resourceNamePrefix, systemTestEnvId, systemTestEnvName, systemTestEnvNameCluster, systemTestRegistrationApiKey, systemTestTags, systemTestUniqueId, testTargets, providerCredsPath, bzeroCredsPath } from './system-test';
import { checkAllSettledPromise, stripTrailingSlash } from './utils/utils';
import * as k8s from '@kubernetes/client-node';
import { ClusterTargetStatusPollError, RegisteredDigitalOceanKubernetesCluster } from '../digital-ocean/digital-ocean-kube.service.types';
import { promisify } from 'util';
import fs from 'fs';
import { exec } from 'child_process';
import { KubeBctlNamespace, KubeHelmQuickstartChartName, KubeTestTargetGroups, KubeTestUserName } from './suites/kube';
import { SSMTestTargetSelfRegistrationAutoDiscovery, TestTarget, BzeroTestTarget } from './system-test.types';
import { BzeroTargetStatusPollError, DigitalOceanBZeroTarget, DigitalOceanSSMTarget, getDOImageName, getPackageManagerType, SsmTargetStatusPollError } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { getAnsibleAutodiscoveryScript, getAutodiscoveryScript, getBzeroBashAutodiscoveryScript, getBzeroAnsibleAutodiscoveryScript } from '../../http-services/auto-discovery-script/auto-discovery-script.http-services';
import { ScriptTargetNameOption } from '../../../webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { addRepo, install, MultiStringValue, SingleStringValue } from './utils/helm/helm-utils';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { DigitalOceanKubeService } from '../digital-ocean/digital-ocean-kube-service';
import { DigitalOceanSSMTargetService } from '../digital-ocean/digital-ocean-ssm-target-service';
import { cleanupHelmAgentInstallation } from './system-test-cleanup';
import { ServiceAccountProviderCredentials } from '../../../src/handlers/login/types/service-account-provider-credentials.types';
import { callZli } from './utils/zli-utils';
import { SubjectHttpService } from '../../http-services/subject/subject.http-services';

// User to create for bzero targets to use for connect/ssh tests
export const bzeroTargetCustomUser = 'bzuser';

// Droplet size to create
const vtDropletSize = DigitalOceanDropletSize.CPU_1_MEM_1GB;
const ssmDropletSize =  DigitalOceanDropletSize.CPU_1_MEM_1GB;

// DigitalOcean cluster ID that is used by all kube system tests
export const systemTestDigitalOceanClusterId = 'e3dd3573-6c83-40de-bd50-7ddef43dea7c';

/**
 * Helper function to setup our system test registration API key
 * @returns Returns a tuple of REST api key, Registration api key
 */
export async function setupSystemTestApiKeys() {
    const restApiKeyName = `${resourceNamePrefix}-api-key`;
    const apiKeyService = new ApiKeyHttpService(configService, logger);
    const systemTestRESTApiKey = await apiKeyService.CreateNewApiKey({ name: restApiKeyName, isRegistrationKey: false });
    logger.info('Created REST api key ' + systemTestRESTApiKey.apiKeyDetails.id);

    const registrationKeyName = `${resourceNamePrefix}-registration-key`;
    const systemTestRegistrationApiKey = await apiKeyService.CreateNewApiKey({ name: registrationKeyName, isRegistrationKey: true });
    logger.info('Created registration api key ' + systemTestRegistrationApiKey.apiKeyDetails.id);

    return [systemTestRESTApiKey, systemTestRegistrationApiKey];
}

/**
 * Helper function to create our Digital ocean test cluster
 */
export async function setupDOTestCluster(): Promise<RegisteredDigitalOceanKubernetesCluster> {
    // Gets cluster information for our static DO cluster
    const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);
    const cluster = await doKubeService.getDigitalOceanClusterById(systemTestDigitalOceanClusterId);

    const shouldUseCustomKubeAgent = !!bzeroKubeAgentImageName;

    // Add the digital ocean cluster to test cluster targets mapping so that
    // we can clean it up in afterAll
    const clusterToRegister: RegisteredDigitalOceanKubernetesCluster = {
        doClusterSummary: cluster,
        kubeConfigFileContents: undefined,
        bzeroClusterTargetSummary: undefined,
        kubeConfigFilePath: undefined,
        helmChartName: `${KubeHelmQuickstartChartName}-${systemTestUniqueId}`,
        helmChartNamespace: `${KubeBctlNamespace}-${systemTestUniqueId}`,
    };

    // Poll DigitalOcean until cluster has entered "running" state. Update
    // mapping with latest retrieved state of cluster.
    const clusterSummary = await doKubeService.pollClusterRunning(cluster);
    clusterToRegister.doClusterSummary = clusterSummary;

    // Get the config file
    const kubeConfigFileContents = await doKubeService.getClusterKubeConfig(cluster);
    clusterToRegister.kubeConfigFileContents = kubeConfigFileContents;

    console.log(`Config retrieved for cluster ${clusterSummary.name}!`);

    // Write to file
    const kubeConfigPath = `/tmp/do-kubeconfig-${systemTestUniqueId}.yml`;
    await promisify(fs.writeFile)(kubeConfigPath, kubeConfigFileContents, { mode: '0600' });
    clusterToRegister.kubeConfigFilePath = kubeConfigPath;

    // Define dictionary of helm --set variables to use in "helm install"
    const helmVariables: { [key: string]: SingleStringValue | MultiStringValue } = {};

    // Set custom helm variables if we're using a custom agent image from
    // the DO private registry
    if (shouldUseCustomKubeAgent) {
        const doRegistryCredentials = await doKubeService.getDigitalOceanContainerRegistryCredentials();

        const kc = new k8s.KubeConfig();
        kc.loadFromFile(kubeConfigPath);
        const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

        // Create namespace and secret before helm install, so the cluster
        // can access the private image during the chart installation
        const namespace = clusterToRegister.helmChartNamespace;
        const registrySecretName = 'do-registry';
        await k8sApi.createNamespace({ metadata: { name: namespace } });
        await k8sApi.createNamespacedSecret(
            namespace,
            {
                metadata: { name: registrySecretName },
                data: { '.dockerconfigjson': Buffer.from(JSON.stringify(doRegistryCredentials)).toString('base64') },
                type: 'kubernetes.io/dockerconfigjson'
            }
        );

        const splitAgentImageNameAndVersion = bzeroKubeAgentImageName.split(':');
        helmVariables['image.agentImageName'] = { value: `${digitalOceanRegistry}${splitAgentImageNameAndVersion[0]}`, type: 'single' };
        helmVariables['image.agentImageTag'] = { value: splitAgentImageNameAndVersion[1], type: 'single' };
        helmVariables['image.agentImagePullSecrets'] = { value: [registrySecretName], type: 'multi' };
    } else {
        // Read from BZERO_AGENT_VERSION if BZERO_KUBE_AGENT_IMAGE is not
        // set
        helmVariables['image.agentImageTag'] = { value: bzeroAgentVersion, type: 'single' };
    }

    // Name of the cluster target added in BastionZero
    const clusterTargetName = `${resourceNamePrefix}-cluster`;

    // Set common helm variables
    helmVariables['image.quickstartImageTag'] = { value: bctlQuickstartVersion, type: 'single' };
    // helm chart expects the service to not cannot contain a
    // trailing slash and our config service includes the slash
    helmVariables['serviceUrl'] = { value: stripTrailingSlash(configService.serviceUrl()), type: 'single' };
    helmVariables['apiKey'] = { value: systemTestRegistrationApiKey.secret, type: 'single' };
    helmVariables['clusterName'] = { value: clusterTargetName, type: 'single' };
    helmVariables['environmentName'] = { value: systemTestEnvNameCluster, type: 'single'};
    helmVariables['users'] = { value: [configService.me().email], type: 'multi' };
    helmVariables['targetUsers'] = { value: [KubeTestUserName], type: 'multi' };
    helmVariables['targetGroups'] = { value: KubeTestTargetGroups, type: 'multi' };
    helmVariables['agentResources.limits.cpu'] = { value: '500m', type: 'single' };
    helmVariables['agentResources.requests.cpu'] = { value: '500m', type: 'single' };
    helmVariables['quickstartResources.limits.cpu'] = { value: '500m', type: 'single' };
    helmVariables['quickstartResources.requests.cpu'] = { value: '500m', type: 'single' };

    let helmChart = '';
    // check if custom charts branch was specified
    if(chartsBranch){
        // clone the charts repo at the given branch
        const cloneCommand = `git clone -b ${chartsBranch} https://github.com/bastionzero/charts.git`;
        const pexec = promisify(exec);
        await pexec(cloneCommand);

        // install helm chart from custom branch
        helmChart = './charts/charts/bctlquickstart';
    } else {
        // ensure bastionzero helm chart repo is added
        await addRepo(KubeBctlNamespace, 'https://bastionzero.github.io/charts/');

        // install bastionzero helm chart
        helmChart = 'bastionzero/bctl-quickstart';
    }

    try {
        await install(clusterToRegister.helmChartName, helmChart, kubeConfigPath, helmVariables, { namespace: clusterToRegister.helmChartNamespace, shouldCreateNamespace: !shouldUseCustomKubeAgent });
    } catch (err) {
        console.log('Helm installation failed. Cleaning up helm chart...');
        await cleanupHelmAgentInstallation(kubeConfigPath, clusterToRegister.helmChartName, clusterToRegister.helmChartNamespace);

        throw err;
    }

    // This should be pretty quick as helm install should not finish until
    // target is online
    try {
        const clusterSummary = await doKubeService.pollClusterTargetOnline(clusterTargetName);
        // Set the cluster target summary associated with this digital ocean
        // cluster
        clusterToRegister.bzeroClusterTargetSummary = clusterSummary;
    } catch (err) {
        // Catch special exception so that we can save cluster target
        // summary reference for cleanup.
        //
        // ClusterTargetStatusPollError is thrown if target reaches 'Error'
        // state, or if target is known but does not come online within the
        // specified timeout.
        if (err instanceof ClusterTargetStatusPollError) {
            clusterToRegister.bzeroClusterTargetSummary = err.clusterSummary;
        }

        // Still throw the error because something failed. No other system
        // tests should continue if one target fails to become Online.
        throw err;
    }

    console.log(
        `Successfully created RegisteredDigitalOceanKubernetesCluster:
            \tDigitalOcean Cluster Name: ${clusterToRegister.doClusterSummary.name}
            \tCluster ID: ${clusterToRegister.doClusterSummary.id}
            \tCluster Version: ${clusterToRegister.doClusterSummary.version}
            \tTarget Name: ${clusterToRegister.bzeroClusterTargetSummary.name}
            \tTarget ID: ${clusterToRegister.bzeroClusterTargetSummary.id}`
    );

    return clusterToRegister;
};

/**
 * Helper function to create our digital ocean test droplets
 */
export async function createDOTestTargets() {
    const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);

    // Create a droplet for various types of test targets
    const createDroplet = async (testTarget: TestTarget) => {
        const targetName = `${resourceNamePrefix}-${getDOImageName(testTarget.dropletImage)}-${testTarget.installType}-${testTarget.awsRegion}`;

        let userDataScript : string;
        let dropletSizeToCreate;
        switch (testTarget.installType) {
        case 'ad':
            // Autodiscovery expect envId, not env name
            userDataScript = await getAutodiscoveryScript(logger, configService, systemTestEnvId, ScriptTargetNameOption.DigitalOceanMetadata, 'staging');
            dropletSizeToCreate = ssmDropletSize;
            break;
        case 'as':
            // Ansible script expects envId not env name
            userDataScript = await getAnsibleUserDataScript(testTarget, systemTestEnvId, 'staging');
            dropletSizeToCreate = ssmDropletSize;
            break;
        case 'pm':
            userDataScript = getPackageManagerRegistrationScript('bzero-ssm-agent', testTarget, systemTestEnvName, systemTestRegistrationApiKey.secret);
            dropletSizeToCreate = ssmDropletSize;
            break;
        case 'pm-bzero':
            userDataScript = getPackageManagerRegistrationScript('bzero-beta', testTarget, systemTestEnvName, systemTestRegistrationApiKey.secret);
            dropletSizeToCreate = vtDropletSize;
            break;
        case 'ad-bzero':
            userDataScript = await getBzeroBashAutodiscoveryScript(logger, configService, systemTestEnvId, ScriptTargetNameOption.DigitalOceanMetadata, true);
            // Add compile from source commands if a bzero branch is specified.
            const stringToFind = 'install_bzero_agent';
            let extraSetupCommands = '';
            if (bzeroAgentBranch) {
                extraSetupCommands = getCompileBzeroFromSourceCommands('bzero-beta');
            }
            // Add the extra setup commands that are necessary for system tests to the autodiscovery script.
            extraSetupCommands += getBzeroTargetSetupCommands();
            const insertionIndex = userDataScript.indexOf(stringToFind) + stringToFind.length;
            userDataScript = userDataScript.slice(0, insertionIndex) + extraSetupCommands + userDataScript.slice(insertionIndex);
            dropletSizeToCreate = vtDropletSize;
            break;
        case 'as-bzero':
            userDataScript = await getAnsibleUserDataScript(testTarget, systemTestEnvId, null);
            dropletSizeToCreate = vtDropletSize;
            break;
        default:
            // Compile-time exhaustive check
            const _exhaustiveCheck: never = testTarget;
            return _exhaustiveCheck;
        }

        const droplet = await doService.createDigitalOceanTarget({
            targetName: targetName,
            dropletParameters: {
                dropletName: targetName,
                dropletSize: dropletSizeToCreate,
                dropletImage: testTarget.dropletImage,
                dropletRegion: testTarget.doRegion,
                dropletTags: [...systemTestTags, systemTestUniqueId],
            }
        }, userDataScript);

        // Add the digital ocean droplet to test targets mapping so that we can clean it up in afterAll
        if(testTarget.installType === 'pm' || testTarget.installType == 'ad' || testTarget.installType == 'as' ) {
            const digitalOceanSsmTarget: DigitalOceanSSMTarget = { type: 'ssm', droplet: droplet, ssmTarget: undefined};
            testTargets.set(testTarget, digitalOceanSsmTarget);

            try {
                const ssmTarget = await doService.pollSsmTargetOnline(targetName);
                // Set the ssmTarget associated with this digital ocean droplet
                digitalOceanSsmTarget.ssmTarget = ssmTarget;
            } catch (err) {
                // Catch special exception so that we can save ssmTarget reference
                // for cleanup.
                //
                // SsmTargetStatusPollError is thrown if target reaches 'Error'
                // state, or if target is known but does not come online within the
                // specified timeout.
                if (err instanceof SsmTargetStatusPollError) {
                    digitalOceanSsmTarget.ssmTarget = err.ssmTarget;
                }

                // Still throw the error because something failed. No other system
                // tests should continue if one target fails to become Online.
                throw err;
            }

            logger.info(
                `Successfully created DigitalOceanTarget:
                \tAWS region: ${testTarget.awsRegion}
                \tDigitalOcean region: ${testTarget.doRegion}
                \tInstall Type: ${testTarget.installType}
                \tDroplet ID: ${digitalOceanSsmTarget.droplet.id}
                \tDroplet Image: ${getDOImageName(testTarget.dropletImage)}
                \tSSM Target ID: ${digitalOceanSsmTarget.ssmTarget.id}`
            );

        } else if(testTarget.installType === 'pm-bzero' || testTarget.installType === 'ad-bzero' || testTarget.installType === 'as-bzero') {
            const digitalOceanBZeroTarget: DigitalOceanBZeroTarget = {  type: 'bzero', droplet: droplet, bzeroTarget: undefined};
            testTargets.set(testTarget, digitalOceanBZeroTarget);

            try {
                const bzeroTarget = await doService.pollBZeroTargetOnline(targetName);

                // Set the bzeroTarget associated with this digital ocean droplet
                digitalOceanBZeroTarget.bzeroTarget = bzeroTarget;
            } catch (err) {
                // Catch special exception so that we can save bzeroTarget reference
                // for cleanup.
                //
                // BzeroTargetStatusPollError is thrown if target reaches 'Error'
                // state, or if target is known but does not come online within the
                // specified timeout.
                if (err instanceof BzeroTargetStatusPollError) {
                    digitalOceanBZeroTarget.bzeroTarget = err.bzeroTarget;
                }

                // Still throw the error because something failed. No other system
                // tests should continue if one target fails to become Online.
                throw err;
            }

            logger.info(
                `Successfully created DigitalOceanSSMTarget:
                \tAWS region: ${testTarget.awsRegion}
                \tDigitalOcean region: ${testTarget.doRegion}
                \tInstall Type: ${testTarget.installType}
                \tDroplet ID: ${digitalOceanBZeroTarget.droplet.id}
                \tDroplet Name: ${digitalOceanBZeroTarget.droplet.name}
                \tDroplet Image: ${getDOImageName(testTarget.dropletImage)}
                \tBZero Target ID: ${digitalOceanBZeroTarget.bzeroTarget.id}`
            );
        }
    };

    // Issue create droplet requests concurrently
    const allDropletCreationResults = Promise.allSettled(allTargets.map(img => createDroplet(img)));
    await checkAllSettledPromise(allDropletCreationResults);
}

/**
 * Helper function to ensure a service account exists and we can login to it in system tests
 */
export async function ensureServiceAccountExistsForLogin(subjectHttpService: SubjectHttpService) {
    const providerCredsFile = JSON.parse(fs.readFileSync(providerCredsPath, 'utf-8')) as ServiceAccountProviderCredentials;
    const providerEmail = providerCredsFile.client_email;

    try {
        await subjectHttpService.GetSubjectByEmail(providerEmail);
        // If the service account already exists it should rotate its MFA secret
        // so that the bzeroCreds file exists for login to use
        await callZli(['service-account', 'rotate-mfa', providerCredsFile.client_email, '--bzeroCreds', bzeroCredsPath]);
    } catch(err) {
        // If the service account doesn't exist it should create it and change its role to admin
        await callZli(['service-account', 'create', providerCredsPath, '--bzeroCreds', bzeroCredsPath]);
        await callZli(['service-account', 'set-role', 'admin', providerEmail]);
    }
}

/**
 * Helper function to build a user data script to install via ansible
 * @param environmentId EnvironmentId to use when registering target
 * @param agentVersion Agent version to use
 * @returns User data script to run on droplet
 */
async function getAnsibleUserDataScript(testTarget: TestTarget, environmentId: string, agentVersion: string): Promise<string> {
    // First get our ansible user data script and set up other needed commands
    let ansibleScript: string;
    let initBlock: string = '';
    if (testTarget.installType === 'as') {
        ansibleScript = await getAnsibleAutodiscoveryScript(logger, configService, environmentId, agentVersion);
    } else if (testTarget.installType === 'as-bzero') {
        ansibleScript = await getBzeroAnsibleAutodiscoveryScript(logger, configService, environmentId, true);
        initBlock = getBzeroTargetSetupCommands();
    }

    const packageManager = getPackageManagerType(testTarget.dropletImage);

    let installBlock: string;
    switch (packageManager) {
    case 'apt':
        installBlock = String.raw`sudo apt update -y
sudo apt install ansible -y
sudo mkdir -p /etc/ansible/
sudo touch /etc/ansible/hosts
`;
        break;
    case 'yum':
        // Ref: https://www.ktexperts.com/how-to-install-ansible-in-amazon-linux-machine/
        installBlock = String.raw`sudo yum update -y
wget https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
sudo yum install epel-release-latest-7.noarch.rpm -y
sudo yum update -y
sudo yum install ansible -y
`;
        break;
    default:
        const _exhaustiveCheck: never = packageManager;
        return _exhaustiveCheck;
    }

    // Add localhost ansible_connection=local to /etc/ansible/hosts to ensure we match the `hosts: all`
    // Then call ansible-playbook
    // The bzero ansible script includes a '$' for parameterizing the yum repo path. Linux here documents allow
    // for parameter substitution, too, but we don't want that behavior. Quoting or escaping the "limit string"
    // at the head of a here document disables parameter substitution within its body.
    // See https://tldp.org/LDP/abs/html/here-docs.html.
    const ansibleInstall = String.raw`cat >playbook.yml <<"EOL"
${ansibleScript}
EOL
echo "localhost ansible_connection=local" | sudo tee /etc/ansible/hosts
sudo ansible-playbook playbook.yml
`;

    return String.raw`#!/bin/bash
set -Ee
${initBlock}
${installBlock}
${ansibleInstall}
`;
}

/**
 * Helper function to get a package manager (yum/apt) install script to pass to user data for a given test target
 * @param packageName Package name to use (bzero-beta vs bzero-ssm-agent)
 * @param testTarget Test target itself
 * @param envName Environment name used in bastion
 * @param registrationApiKeySecret API key used to activate these agents
 * @returns User data script to run on droplet
 */
function getPackageManagerRegistrationScript(packageName: string, testTarget: SSMTestTargetSelfRegistrationAutoDiscovery | BzeroTestTarget, envName: string, registrationApiKeySecret: string): string {
    let installBlock: string;
    const packageManager = getPackageManagerType(testTarget.dropletImage);
    const shouldBuildFromSource = packageName === 'bzero-beta' && bzeroAgentBranch;

    // Always install agent using the beta repo -- when building from source, we do this exclusively for the side-effect of
    // placing an executable in /usr/bin/bzero, which we will replace with what we build. That will allow us to manage
    // it with systemd, which is required for testing agent restart events
    switch (packageManager) {
    case 'apt':
        installBlock = String.raw`sudo apt update -y
sudo apt install -y software-properties-common
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E5C358E613982017
sudo add-apt-repository 'deb https://download-apt.bastionzero.com/beta/apt-repo stable main'
sudo apt update -y
sudo apt install ${packageName} -y
`;
        break;
    case 'yum':
        installBlock = String.raw`sudo yum-config-manager --add-repo https://download-yum.bastionzero.com/bastionzero-beta.repo
sudo yum update -y
sudo yum install ${packageName} -y
`;
        break;
    default:
        // Compile-time exhaustive check
        const _exhaustiveCheck: never = packageManager;
        return _exhaustiveCheck;
    }

    if (shouldBuildFromSource) {
        installBlock += getCompileBzeroFromSourceCommands('bzero-beta');
    }

    let registerCommand: string;
    let initBlock: string = '';
    switch(testTarget.installType) {
    case 'pm':
        registerCommand = `${packageName} --serviceUrl ${configService.serviceUrl()} -registrationKey "${registrationApiKeySecret}" -envName "${envName}"`;
        break;
    case 'pm-bzero':
        registerCommand = `${packageName} --serviceUrl ${configService.serviceUrl()} -registrationKey "${registrationApiKeySecret}" -environmentName "${envName}"`;

        initBlock = getBzeroTargetSetupCommands();
        break;
    }

    return String.raw`#!/bin/bash
set -Ee
${installBlock}
${initBlock}
${registerCommand}
`;
}

// Common initialization for bzero targets
function getBzeroTargetSetupCommands(): string {
    // Starts a python web server in background for web tests
    const pythonWebServerCmd = 'nohup python3 -m http.server > python-server.out 2> python-server.err < /dev/null &';
    const iperfCmd = `nohup iperf3 -s > /var/log/iperf.log 2>&1 &`;

    // Add a bzero custom user for connect/ssh tests
    // --shell options sets default shell as bash
    // -m option will create a home directory with proper permissions
    const createBzeroCustomerUserCmd = `useradd ${bzeroTargetCustomUser} --shell /bin/bash -m`;

    return String.raw`
${pythonWebServerCmd}
${iperfCmd}
${createBzeroCustomerUserCmd}
`;
}

function getCompileBzeroFromSourceCommands(packageName: 'bzero' | 'bzero-beta'): string {
    return String.raw`
cd /
git clone -b ${bzeroAgentBranch} https://github.com/bastionzero/bzero.git /root/bzero
export GOROOT=/usr/local/go
export GOPATH=/root/go
export GOCACHE=/root/.cache/go-build
sh /root/bzero/update-agent-version.sh
cd /root/bzero/bctl/agent
/usr/local/go/bin/go build
systemctl stop ${packageName}
cp agent /usr/bin/${packageName}
systemctl restart ${packageName}
cd /
`;
}