// TODO: Remove this once we determine the cause of the leaky handlers
require('leaked-handles').set({
    fullStack: true, // use full stack traces
    timeout: 30000, // run every 30 seconds instead of 5.
    debugSockets: true // pretty print tcp thrown exceptions.
});

import path from 'path';

import { envMap } from '../../cli-driver';
import { DigitalOceanBZeroTarget, DigitalOceanSSMTarget } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { randomAlphaNumericString } from '../../utils/utils';
import { listTargetsSuite } from './suites/list-targets';
import { versionSuite } from './suites/version';
import { RegisteredDigitalOceanKubernetesCluster } from '../digital-ocean/digital-ocean-kube.service.types';
import { kubeSuite } from './suites/kube';
import { checkAllSettledPromise } from './utils/utils';
import { NewApiKeyResponse } from '../../../webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';
import { TestTarget } from './system-test.types';
import { EnvironmentHttpService } from '../../http-services/environment/environment.http-services';
import { iperfSuite } from './suites/iperf';
import { extraSsmTestTargetsToRun, extraBzeroTestTargetsToRun, ssmTestTargetsToRun, bzeroTestTargetsToRun, initRegionalSSMTargetsTestConfig } from './targets-to-run';
import { setupDOTestCluster, createDOTestTargets, setupSystemTestApiKeys, ensureServiceAccountExistsForLogin, ensureServiceAccountRole } from './system-test-setup';
import { cleanupDOTestCluster, cleanupDOTestTargets, cleanupSystemTestApiKeys } from './system-test-cleanup';
import { apiKeySuite } from './suites/rest-api/api-keys';
import { organizationSuite } from './suites/rest-api/organization';
import { environmentsSuite } from './suites/rest-api/environments';
import { policySuite } from './suites/rest-api/policies/policies';
import { groupsSuite } from './suites/groups';
import { callZli, mockCleanExit } from './utils/zli-utils';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { ssmTargetRestApiSuite } from './suites/rest-api/ssm-targets';
import { bzeroTargetRestApiSuite } from './suites/rest-api/bzero-targets';
import { kubeClusterRestApiSuite } from './suites/rest-api/kube-targets';
import { databaseTargetRestApiSuite } from './suites/rest-api/database-targets';
import { webTargetRestApiSuite } from './suites/rest-api/web-targets';
import { dynamicAccessConfigRestApiSuite } from './suites/rest-api/dynamic-access-configs';
import { agentContainerSuite } from './suites/agent-container';
import { userRestApiSuite } from './suites/rest-api/users';
import { spacesRestApiSuite } from './suites/rest-api/spaces';
import { mfaSuite } from './suites/rest-api/mfa';
import { eventsRestApiSuite } from './suites/rest-api/events';
import { webSuite } from './suites/web';
import { dbSuite } from './suites/db';
import { agentRecoverySuite } from './suites/agent-recovery';
import { connectSuite } from './suites/connect';
import { sessionRecordingSuite } from './suites/session-recording';
import { sshSuite } from './suites/ssh';
import { dynamicAccessSuite } from './suites/dynamic-access';
import { sendLogsSuite } from './suites/send-logs';
import { clearAllTimeouts } from './utils/test-utils';
import { SubjectHttpService } from '../../../src/http-services/subject/subject.http-services';
import { serviceAccountRestApiSuite } from './suites/rest-api/service-accounts';
import { serviceAccountSuite } from './suites/service-account';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { ServiceAccountSummary } from '../../../webshell-common-ts/http/v2/service-account/types/service-account-summary.types';
import { ServiceAccountHttpService } from '../..//http-services/service-account/service-account.http-services';

// Uses config name from ZLI_CONFIG_NAME environment variable (defaults to prod
// if unset) This can be run against dev/stage/prod when running system tests
// locally using your own configuration file. When running as part of the CI/CD
// pipeline in the AWS dev account this will be 'dev' and when running as part
// of the CD pipeline in the AWS prod account it will be 'stage'
const configName = envMap.configName;

// Setup services used for running system tests
export const loggerConfigService = new LoggerConfigService(configName, false, envMap.configDir);
export const logger = new Logger(loggerConfigService, false, false, true);
export const configService = new ConfigService(configName, logger, envMap.configDir, true);

// This is the UserSummary for the user that is used to run system tests. When
// RUN_AS_SERVICE account is enabled this will still be the user system tests
// uses to initially create the SA before logging in as that SA. It is reused in
// the userRestApiSuite.
export let systemTestUser: UserSummary;

// This is the ServiceAccountSummary for the SA created in system tests. This is
// either created in global beforeAll when RUN_AS_SERVICE_ACCOUNT is true or by
// the serviceAccountSuite when RUN_AS_SERVICE_ACCOUNT is false. In either case
// its reused for the serviceAccountRestApiSuite.
export let systemTestServiceAccount: ServiceAccountSummary;
export function setSystemTestServiceAccount(serviceAccountSummary: ServiceAccountSummary) {
    systemTestServiceAccount = serviceAccountSummary;
}

export const providerCredsPath = path.join(envMap.configDir, 'provider-file.json');
export const bzeroCredsPath =  path.join(envMap.configDir, 'bzero-credentials.json');

export const doApiKey = process.env.DO_API_KEY;
if (!doApiKey) {
    throw new Error('Must set the DO_API_KEY environment variable');
}

export const datEndpoint = process.env.DAT_SERVER_ENDPOINT;
if (!datEndpoint) {
    throw new Error('Must set the DAT_SERVER_ENDPOINT environment variable');
}

export const datSecret = process.env.DAT_SERVER_SHARED_SECRET;
if (!datSecret) {
    throw new Error('Must set the DAT_SERVER_SHARED_SECRET environment variable');
}

export const bzeroAgentVersion = process.env.BZERO_AGENT_VERSION;
if(! bzeroAgentVersion) {
    throw new Error('Must set the BZERO_AGENT_VERSION environment variable');
}

export const bctlQuickstartVersion = process.env.BCTL_QUICKSTART_VERSION;
if (! bctlQuickstartVersion) {
    throw new Error('Must set the BCTL_QUICKSTART_VERSION environment variable');
}

export const RUN_AS_SERVICE_ACCOUNT = process.env.RUN_AS_SERVICE_ACCOUNT ? (process.env.RUN_AS_SERVICE_ACCOUNT === 'true') : false;
export const KUBE_ENABLED = process.env.KUBE_ENABLED ? (process.env.KUBE_ENABLED === 'true') : true;
const VT_ENABLED = process.env.VT_ENABLED ? (process.env.VT_ENABLED === 'true') : true;
const BZERO_ENABLED = process.env.BZERO_ENABLED ? (process.env.BZERO_ENABLED === 'true') : true;
const SSM_ENABLED =  process.env.SSM_ENABLED ? (process.env.SSM_ENABLED === 'true') : true;
const API_ENABLED = process.env.API_ENABLED ? (process.env.API_ENABLED === 'true') : true;
const AGENT_RECOVERY_ENABLED = process.env.AGENT_RECOVERY_ENABLED ? (process.env.AGENT_RECOVERY_ENABLED === 'true') : true;
const SERVICE_ACCOUNT_ENABLED =  process.env.SERVICE_ACCOUNT_ENABLED ? (process.env.SERVICE_ACCOUNT_ENABLED === 'true') : true;
export const IN_PIPELINE = process.env.IN_PIPELINE ? process.env.IN_PIPELINE === 'true' : false;;

export const IN_CI = process.env.BZERO_IN_CI ? (process.env.BZERO_IN_CI === '1') : false;
export const SERVICE_URL = configService.serviceUrl();

// Make sure we have defined our groupId if we are configured against cloud-dev or cloud-staging
export let GROUP_ID: string = undefined;
export let GROUP_NAME: string = undefined;
const NOT_USING_RUNNER: boolean = SERVICE_URL.includes('cloud-dev') || SERVICE_URL.includes('cloud-staging');
if (IN_CI && NOT_USING_RUNNER) {
    GROUP_ID = process.env.GROUP_ID;
    if (! GROUP_ID) {
        throw new Error('Must set the GROUP_ID environment variable');
    }

    GROUP_NAME = process.env.GROUP_NAME;
    if (! GROUP_NAME) {
        throw new Error('Must set the GROUP_NAME environment variable');
    }
}


export const systemTestTags = process.env.SYSTEM_TEST_TAGS ? process.env.SYSTEM_TEST_TAGS.split(',').filter(t => t != '') : ['system-tests'];

// Set this environment variable to compile agent from specific remote branch
export const bzeroAgentBranch = process.env.BZERO_AGENT_BRANCH;
if (bzeroAgentBranch) {
    logger.info(`BZERO_AGENT_BRANCH is set. Using specific branch for vt tests (agent): ${bzeroAgentBranch}.`);
}

// Set this environment variable to get helm charts from specific remote branch
export const chartsBranch = process.env.CHARTS_BRANCH;
if (chartsBranch) {
    logger.info(`CHARTS_BRANCH is set. Using specific branch for kube tests (helm): ${chartsBranch}.`);
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
let systemTestRESTApiKey: NewApiKeyResponse;

// Create a new API key to be used for self-registration SSM test targets
export let systemTestRegistrationApiKey: NewApiKeyResponse;

// Global mapping of system test targets
export const testTargets = new Map<TestTarget, DigitalOceanSSMTarget | DigitalOceanBZeroTarget >();

// Add extra targets to test config based on EXTRA_REGIONS env var
ssmTestTargetsToRun.push(...initRegionalSSMTargetsTestConfig(logger));

// Add extra targets if in pipeline mode
if (IN_PIPELINE && IN_CI) {
    ssmTestTargetsToRun.push(...extraSsmTestTargetsToRun);
    bzeroTestTargetsToRun.push(...extraBzeroTestTargetsToRun);
}

// Global mapping of a registered Kubernetes system test cluster
export let testCluster : RegisteredDigitalOceanKubernetesCluster = undefined;

// Global mapping of all other targets
export let allTargets: TestTarget[] = [];

if(SSM_ENABLED) {
    allTargets = allTargets.concat(ssmTestTargetsToRun);
} else {
    logger.info(`Skipping adding ssm targets because SSM_ENABLED is false`);
}

if(BZERO_ENABLED) {
    allTargets = allTargets.concat(bzeroTestTargetsToRun);
} else {
    logger.info(`Skipping adding bzero targets because BZERO_ENABLED is false`);
}

export const systemTestUniqueId = process.env.SYSTEM_TEST_UNIQUE_ID ? process.env.SYSTEM_TEST_UNIQUE_ID : randomAlphaNumericString(15).toLowerCase();

// All BastionZero API resources created during system tests have a name that
// begins with this prefix
export const resourceNamePrefix = `st-${systemTestUniqueId}`;

export const systemTestEnvName = `${resourceNamePrefix}-non-kube-env`;
export let systemTestEnvId: string = undefined;
export const systemTestPolicyTemplate = `${resourceNamePrefix}-$POLICY_TYPE-policy`;
export const systemTestEnvNameCluster = `${resourceNamePrefix}-cluster-env`;

// Setup all droplets before running tests
beforeAll(async () => {
    // First mock clean exit in case anything in system test global
    // setup/teardown hits a cleanExit e.g callZli(['disconnect']) in the
    // teardown
    mockCleanExit();

    // Reset ssh config key paths because these are different for the IdPLogin
    // tests (run as ec2-user) which uploads the config that system test uses
    configService.clearSshConfigPaths();

    // Reset sessionId and sessionToken to get unique session for this test
    configService.setSessionId('');
    configService.setSessionToken('');

    // Call register to create new session token and id, and verify session with totp
    const sysTestMfaSecret = process.env.MFA_SECRET;
    const registerCmd = ['register'];
    if(sysTestMfaSecret) {
        registerCmd.push('--mfaSecret', sysTestMfaSecret);
    }
    await callZli(registerCmd);

    // Update me section of the config in case this is a new login or any
    // user information has changed since last login
    const subjectHttpService = new SubjectHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const me = await subjectHttpService.Me();
    configService.setMe(me);
    systemTestUser = await userHttpService.Me();

    // Create a new api key that can be used for system tests
    [systemTestRESTApiKey, systemTestRegistrationApiKey] = await setupSystemTestApiKeys();

    // Create a new environment for this system test
    const environmentService = new EnvironmentHttpService(configService, logger);
    const createEnvResponse = await environmentService.CreateEnvironment({
        name: systemTestEnvName,
        description: `Autocreated environment for system test: ${systemTestUniqueId}`,
        offlineCleanupTimeoutHours: 1
    });
    systemTestEnvId = createEnvResponse.id;

    // A service account cannot add itself to targets, thus when running as one
    // we need to firstly create it so the targets pick it up upon registration.
    // Logging in before we create the DO cluster also means the SA will be the
    // subject in the kube policy that gets created when installing via helm
    if(RUN_AS_SERVICE_ACCOUNT){
        const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
        await ensureServiceAccountExistsForLogin(subjectHttpService, serviceAccountHttpService);
        await ensureServiceAccountRole(subjectHttpService, true);
        await callZli(['service-account', 'login', '--providerCreds', providerCredsPath, '--bzeroCreds', bzeroCredsPath]);
        systemTestServiceAccount = await serviceAccountHttpService.Me();
    }

    await checkAllSettledPromise(Promise.allSettled([
        createDOTestTargets(),
        async function() {
            // Skip kube cluster setup
            if (!KUBE_ENABLED) {
                logger.info(`Skipping setup of cluster because KUBE_ENABLED is false`);
                return;
            }
            testCluster = await setupDOTestCluster();
        }()
    ]));
}, 20 * 60 * 1000);

// Cleanup droplets after running all tests
afterAll(async () => {
    // Always clean up any daemons otherwise this can
    // lead to leaky child process'
    logger.info('Calling zli disconnect...');
    await callZli(['disconnect']);

    // Delete the API key created for system tests
    logger.info('Cleaning up system test API keys...');
    await cleanupSystemTestApiKeys(systemTestRESTApiKey, systemTestRegistrationApiKey);

    logger.info('Cleaning up any digital ocean objects...');
    await checkAllSettledPromise(Promise.allSettled([
        cleanupDOTestTargets(),
        async function() {
            if (testCluster === undefined) {
                return;
            }
            await cleanupDOTestCluster(testCluster);
        }()
    ]));

    // Delete the environment for this system test
    // Note this must be called after our cleanup, so we do not have any targets in the environment
    logger.info('Cleaning up any BastionZero environments...');
    if (systemTestEnvId) {
        const environmentService = new EnvironmentHttpService(configService, logger);
        await environmentService.DeleteEnvironment(systemTestEnvId);
    }

    // Finally clear any leftover sleepTimeouts that may have been started by
    // system tests so jest doesnt wait for them
    clearAllTimeouts();
}, 60 * 1000);

beforeEach(async () => {
    // Mocks must be cleared and restored prior to running each test
    // case. This is because Jest mocks and spies are global. We don't
    // want any captured mock state (invocations, spied args, etc.) and
    // mock implementations to leak through the different test runs.
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Always setup a mock implementation for cleanExit so we dont hit process.exit()
    // Spy on calls to cleanExit but dont call process.exit. Still throw an
    // exception if exitCode != 0 which will fail the test
    mockCleanExit();

    logger.info(`${new Date()} -- before test: ${expect.getState().currentTestName}`);
});

afterEach(async () => {
    logger.info(`${new Date()} -- after test: ${expect.getState().currentTestName}`);
});

if (SERVICE_ACCOUNT_ENABLED && !RUN_AS_SERVICE_ACCOUNT) {
    serviceAccountSuite();
}

// Call list target suite anytime a target test is called
if (SSM_ENABLED || BZERO_ENABLED || KUBE_ENABLED) {
    listTargetsSuite();
}

// Call send logs suite if bzero and kube are both enabled
// This suite covers both bzero and cluster agents
if (BZERO_ENABLED && KUBE_ENABLED) {
    sendLogsSuite();
}

// These suites are based on testing allTargets use SSM_ENABLED or BZERO_ENABLED
// environment variables to control which targets are created
if(SSM_ENABLED || BZERO_ENABLED) {
    connectSuite();
    sessionRecordingSuite();
    sshSuite();

    if (IN_CI && NOT_USING_RUNNER && !RUN_AS_SERVICE_ACCOUNT) {
        // Only run group tests if we are in CI and talking to staging or dev
        // and not running as a service account
        groupsSuite();
    };
}

// BZero only test suites
if(BZERO_ENABLED) {
    dynamicAccessSuite();
}

// Only run the agent container suite when we are running
// in the pipeline
if(IN_PIPELINE) {
    agentContainerSuite();
}

if(KUBE_ENABLED) {
    kubeSuite();
}

if(VT_ENABLED) {
    dbSuite();
    webSuite();
    iperfSuite();
}

if (API_ENABLED) {
    apiKeySuite();
    organizationSuite();
    environmentsSuite();
    policySuite();
    dynamicAccessConfigRestApiSuite();
    userRestApiSuite();
    spacesRestApiSuite();
    mfaSuite();
    eventsRestApiSuite();

    if (SERVICE_ACCOUNT_ENABLED) {
        serviceAccountRestApiSuite();
    } else {
        logger.info('Skipping service account REST API suite because service account is disabled.');
    }

    if (SSM_ENABLED) {
        // Since this suite modifies an SSM target name, we must be cautious if we parallelize test suite running because
        // other SSM-related tests could fail that rely on the name, such as tests that use the name with 'zli connect'.
        // It may be possible to allow parallelization if we use target IDs instead of names in `zli connect`.
        ssmTargetRestApiSuite();
    } else {
        logger.info('Skipping SSM target REST API suite because SSM target creation is disabled.');
    }
    if (VT_ENABLED) {
        // Since this suite modifies a bzero target name, we must be cautious if we parallelize test suite running because
        // other SSM-related tests could fail that rely on the name, such as tests that use the name with 'zli connect'.
        // It may be possible to allow parallelization if we use target IDs instead of names in `zli connect`.
        bzeroTargetRestApiSuite();

        databaseTargetRestApiSuite();
        webTargetRestApiSuite();
    } else {
        logger.info('Skipping Bzero, web, and db target REST API suites because Bzero target creation is disabled.');
    }
    if (KUBE_ENABLED) {
        // See notes above about running this suite in parallel - the same caution applies here.
        kubeClusterRestApiSuite();
    } else {
        logger.info('Skipping kube cluster REST API suite because kube cluster creation is disabled.');
    }
}

if (AGENT_RECOVERY_ENABLED && BZERO_ENABLED && KUBE_ENABLED && process.env.TEST_RUNNER_KUBE_CONFIG) {
    logger.info('Running agent recovery tests');
    agentRecoverySuite(process.env.TEST_RUNNER_KUBE_CONFIG, process.env.TEST_RUNNER_UNIQUE_ID);
} else {
    logger.info('Skipping agent recovery tests: One of AGENT_RECOVERY_ENABLED, BZERO_ENABLED, KUBE_ENABLED, or TEST_RUNNER_KUBE_CONFIG is not set');
}

// Always run the version suite
versionSuite();