import { envMap } from '../../cli-driver';
import { DigitalOceanBZeroTarget, DigitalOceanDistroImage, DigitalOceanSSMTarget } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanSSMTargetService } from '../digital-ocean/digital-ocean-ssm-target-service';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { OAuthService } from '../../services/oauth/oauth.service';
import { randomAlphaNumericString } from '../../utils/utils';
import { connectSuite } from './suites/connect';
import { sshSuite } from './suites/ssh';
import { listTargetsSuite } from './suites/list-targets';
import { versionSuite } from './suites/version';
import { DigitalOceanKubernetesClusterVersion, RegisteredDigitalOceanKubernetesCluster } from '../digital-ocean/digital-ocean-kube.service.types';
import { DigitalOceanKubeService } from '../digital-ocean/digital-ocean-kube-service';
import { kubeSuite } from './suites/kube';
import { checkAllSettledPromise, initRegionalSSMTargetsTestConfig } from './utils/utils';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { NewApiKeyResponse } from '../../../webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';
import { TestTarget } from './system-test.types';
import { EnvironmentHttpService } from '../../http-services/environment/environment.http-services';
import { vtSuite } from './suites/vt';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { ssmTestTargetsToRun, vtTestTargetsToRun } from './targets-to-run';
import { createDOTestClusters, createDOTestTargets, setupSystemTestApiKeys } from './system-test-setup';
import { cleanupDOTestClusters, cleanupDOTestTargets, cleanupSystemTestApiKeys } from './system-test-cleanup';
import { apiKeySuite } from './suites/rest-api/api-keys';
import { environmentsSuite } from './suites/rest-api/environments';

// Uses config name from ZLI_CONFIG_NAME environment variable (defaults to prod
// if unset) This can be run against dev/stage/prod when running system tests
// locally using your own configuration file. When running as part of the CI/CD
// pipeline in the AWS dev account this will be 'dev' and when running as part
// of the CD pipeline in the AWS prod account it will be 'stage'
const configName = envMap.configName;

// Setup services used for running system tests
export const loggerConfigService = new LoggerConfigService(configName, envMap.configDir);
export const logger = new Logger(loggerConfigService, false, false, true);
export const configService = new ConfigService(configName, logger, envMap.configDir);
export const policyService = new PolicyHttpService(configService, logger);

const oauthService = new OAuthService(configService, logger);
export const environmentService = new EnvironmentHttpService(configService, logger);
const doApiKey = process.env.DO_API_KEY;
if (!doApiKey) {
    throw new Error('Must set the DO_API_KEY environment variable');
}
export const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);
export const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);

export const bzeroAgentVersion = process.env.BZERO_AGENT_VERSION;
if(! bzeroAgentVersion) {
    throw new Error('Must set the BZERO_AGENT_VERSION environment variable');
}

export const bctlQuickstartVersion = process.env.BCTL_QUICKSTART_VERSION;
if (! bctlQuickstartVersion) {
    throw new Error('Must set the BCTL_QUICKSTART_VERSION environment variable');
}

const KUBE_ENABLED = process.env.KUBE_ENABLED ? (process.env.KUBE_ENABLED === 'true') : true;
const VT_ENABLED = process.env.VT_ENABLED ? (process.env.VT_ENABLED === 'true') : true;
const SSM_ENABLED =  process.env.SSM_ENABLED ? (process.env.SSM_ENABLED === 'true') : true;
const API_ENABLED = process.env.API_ENABLED ? (process.env.API_ENABLED === 'true') : true;


export const systemTestTags = process.env.SYSTEM_TEST_TAGS ? process.env.SYSTEM_TEST_TAGS.split(',').filter(t => t != '') : ['system-tests'];

// Set this environment variable to compile agent from specific remote branch
export const bzeroAgentBranch = process.env.BZERO_AGENT_BRANCH;
// Go version to use when compiling vt bzero agent
// Reference: https://go.dev/dl/ (Linux section)
export const goVersion = 'go1.17.7.linux-amd64';
if (bzeroAgentBranch) {
    logger.info(`BZERO_AGENT_BRANCH is set. Using specific branch for vt tests (agent): ${bzeroAgentBranch}. Go version: ${goVersion}`);
}

// URL of private DigitalOcean registry
export const digitalOceanRegistry = 'registry.digitalocean.com/bastionzero-do/';
// Set this environment variable to use a specific kube agent from the private
// DigitalOcean registry
export const bzeroKubeAgentImageName = process.env.BZERO_KUBE_AGENT_IMAGE;
// Validate format
if (bzeroKubeAgentImageName && bzeroKubeAgentImageName.split(':').length != 2) {
    throw new Error('BZERO_KUBE_AGENT_IMAGE environment variable must follow syntax -> image-name:image-version');
}

if (bzeroKubeAgentImageName) {
    logger.info(`BZERO_KUBE_AGENT_IMAGE is set. Using the following image for kube tests (agent): ${bzeroKubeAgentImageName}`);
}

// Create a new API Key to be used for cluster registration
export const apiKeyService = new ApiKeyHttpService(configService, logger);
let systemTestRESTApiKey: NewApiKeyResponse;

// Create a new API key to be used for self-registration SSM test targets
export let systemTestRegistrationApiKey: NewApiKeyResponse;

// Global mapping of system test targets
export const testTargets = new Map<TestTarget, DigitalOceanSSMTarget | DigitalOceanBZeroTarget >();

// Add extra targets to test config based on EXTRA_REGIONS env var
initRegionalSSMTargetsTestConfig(logger);

export let allTargets: TestTarget[] = [];

if(SSM_ENABLED) {
    allTargets = allTargets.concat(ssmTestTargetsToRun);
} else {
    logger.info(`Skipping adding ssm targets because SSM_ENABLED is false`);
}

if(VT_ENABLED) {
    allTargets = allTargets.concat(vtTestTargetsToRun);
} else {
    logger.info(`Skipping adding vt targets because VT_ENABLED is false`);
}

// Global mapping of Kubernetes cluster targets
export const testClusters = new Map<DigitalOceanKubernetesClusterVersion, RegisteredDigitalOceanKubernetesCluster>();

// Kubernetes cluster versions to use during system tests. Each version corresponds to a new cluster.
export const clusterVersionsToRun: DigitalOceanKubernetesClusterVersion[] = [
    DigitalOceanKubernetesClusterVersion.LatestVersion
];

export const systemTestUniqueId = randomAlphaNumericString(15).toLowerCase();
export const systemTestEnvName = `system-test-${systemTestUniqueId}-custom-env`; // Note the -custom, if we just use -env it conflicts with the autocreated kube env
export let systemTestEnvId: string = undefined;
export const systemTestPolicyTemplate = `system-test-$POLICY_TYPE-policy-${systemTestUniqueId}`;

// Setup all droplets before running tests
beforeAll(async () => {
    // Refresh the ID token because it is likely expired
    await oauthService.getIdTokenAndExitOnError();

    // Create a new api key that can be used for system tests
    [systemTestRESTApiKey, systemTestRegistrationApiKey] = await setupSystemTestApiKeys();

    // Create a new environment for this system test
    const createEnvResponse = await environmentService.CreateEnvironment({
        name: systemTestEnvName,
        description: `Autocreated environment for system test: ${systemTestUniqueId}`,
        offlineCleanupTimeoutHours: 1
    });
    systemTestEnvId = createEnvResponse.id;

    await checkAllSettledPromise(Promise.allSettled([
        createDOTestTargets(),  
        createDOTestClusters(KUBE_ENABLED)
    ]));
}, 20 * 60 * 1000);

// Cleanup droplets after running all tests
afterAll(async () => {
    // Delete the API key created for system tests
    await cleanupSystemTestApiKeys(systemTestRESTApiKey, systemTestRegistrationApiKey);

    await checkAllSettledPromise(Promise.allSettled([
        cleanupDOTestTargets(),
        cleanupDOTestClusters()
    ]));

    // Delete the environment for this system test
    // Note this must be called after our cleanup, so we do not have any targets in the environment
    if (systemTestEnvId) {
        await environmentService.DeleteEnvironment(systemTestEnvId);
    }
}, 60 * 1000);

// Call list target suite anytime a target test is called 
if (SSM_ENABLED || KUBE_ENABLED || VT_ENABLED) {
    listTargetsSuite();
}

// Call various test suites
if(SSM_ENABLED) {
    connectSuite();
    sshSuite();
}

if(KUBE_ENABLED) {
    kubeSuite();
}

if(VT_ENABLED) {
    vtSuite();
}

if (API_ENABLED) {
    apiKeySuite();
    environmentsSuite()
}

// Always run the version suite
versionSuite()