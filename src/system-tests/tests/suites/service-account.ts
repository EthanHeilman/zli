import { callZli } from '../utils/zli-utils';
import fs from 'fs';
import { ServiceAccountBzeroCredentials } from '../../../../src/handlers/login/types/service-account-bzero-credentials.types';
import { bzeroCredsPath, configService, IN_PIPELINE, logger, providerCredsPath, setSystemTestServiceAccount, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId } from '../system-test';
import { ServiceAccountProviderCredentials } from '../../../../src/handlers/login/types/service-account-provider-credentials.types';
import { Logger } from '../../../../src/services/logger/logger.service';
import { ServiceAccountHttpService } from '../../../http-services/service-account/service-account.http-services';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { TestUtils } from '../utils/test-utils';
import { ConnectTestUtils } from '../utils/connect-utils';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { getMockResultValue } from '../utils/jest-utils';
import { ConfigService } from '../../../services/config/config.service';
import { envMap } from '../../../cli-driver';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { VerbType } from '../../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { cleanupTargetConnectPolicies } from '../system-test-cleanup';
import { testIf } from '../utils/utils';
import { ensureServiceAccountExistsForLogin, ensureServiceAccountRole } from '../system-test-setup';
import { SubjectHttpService } from '../../../http-services/subject/subject.http-services';

export const serviceAccountSuite = () => {
    describe('Service Account Suite', () => {
        const targetConnectPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'sa-configure-target-connect');
        const appNameRegex = new RegExp('https://(.*).bastionzero.com/');
        const appNameRegexTokenized = appNameRegex.exec(configService.getBastionUrl());
        const appName = appNameRegexTokenized[1]; // prod/stage/dev/tr-1 etc

        let policyService: PolicyHttpService;
        let subjectHttpService: SubjectHttpService;
        let serviceAccountHttpService: ServiceAccountHttpService;
        let connectTestUtils: ConnectTestUtils;

        beforeAll(async () => {
            policyService = new PolicyHttpService(configService, logger);
            subjectHttpService = new SubjectHttpService(configService, logger);
            serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);

            if(IN_PIPELINE) {
                // Make sure the bzeroCreds file exists because it wont be
                // created when running in pipeline against cloud-dev or
                // cloud-staging
                await ensureServiceAccountExistsForLogin(subjectHttpService, serviceAccountHttpService);
                await ensureServiceAccountRole(subjectHttpService, false);
            }
        });

        afterAll(async() => {
            // cleanup from configure sa test
            if(connectTestUtils) await connectTestUtils.cleanup();
            await cleanupTargetConnectPolicies(targetConnectPolicyName);

            // After the SA system tests are done we should get a stable SA summary and use that for API tests
            const loginServiceAccountSpy = jest.spyOn(ServiceAccountHttpService.prototype, 'LoginServiceAccount');
            await callZli(['service-account', 'login', '--providerCreds', providerCredsPath, '--bzeroCreds', bzeroCredsPath, '--configName', appName]);

            expect(loginServiceAccountSpy).toHaveBeenCalledOnce();
            const serviceAccountSummary = await getMockResultValue(loginServiceAccountSpy.mock.results[0]);
            setSystemTestServiceAccount(serviceAccountSummary);
        });

        // test successfully creating a service account
        testIf(!IN_PIPELINE, '481485: Create service account as user', async () => {
            await callZli(['service-account', 'create', providerCredsPath, '--bzeroCreds', bzeroCredsPath]);
            const bzeroCredsFile = JSON.parse(fs.readFileSync(bzeroCredsPath, 'utf-8')) as ServiceAccountBzeroCredentials;
            expect(bzeroCredsFile).toBeTruthy();
            expect(bzeroCredsFile.mfa_secret).toBeTruthy();

            const loggerSpy = jest.spyOn(Logger.prototype, 'info');
            const providerCredsFile = JSON.parse(fs.readFileSync(providerCredsPath, 'utf-8')) as ServiceAccountProviderCredentials;
            await callZli(['service-account', 'login', '--providerCreds', providerCredsPath, '--bzeroCreds', bzeroCredsPath, '--configName', appName]);
            expect(loggerSpy).toHaveBeenCalled();
            const output = loggerSpy.mock.calls[1][0];
            expect(output).toContain(`Logged in as: ${providerCredsFile.client_email}`);
        }, 60 * 1000);

        // test successfully rotating the mfa key of a service account
        it('481485: Rotate service account mfa key as user', async () => {
            const bzeroCredsFile = JSON.parse(fs.readFileSync(bzeroCredsPath, 'utf-8')) as ServiceAccountBzeroCredentials;
            const providerCredsFile = JSON.parse(fs.readFileSync(providerCredsPath, 'utf-8')) as ServiceAccountProviderCredentials;

            await callZli(['service-account', 'rotate-mfa', providerCredsFile.client_email, '--bzeroCreds', bzeroCredsPath]);
            const editedBzeroCredsFile = JSON.parse(fs.readFileSync(bzeroCredsPath, 'utf-8')) as ServiceAccountBzeroCredentials;
            expect(editedBzeroCredsFile).toBeTruthy();
            expect(editedBzeroCredsFile.mfa_secret).toBeTruthy();
            expect(bzeroCredsFile.mfa_secret).not.toEqual(editedBzeroCredsFile.mfa_secret);

            const loggerSpy = jest.spyOn(Logger.prototype, 'info');
            await callZli(['service-account', 'login', '--providerCreds', providerCredsPath, '--bzeroCreds', bzeroCredsPath, '--configName', appName]);
            expect(loggerSpy).toHaveBeenCalled();
            const output = loggerSpy.mock.calls[1][0];
            expect(output).toContain(`Logged in as: ${providerCredsFile.client_email}`);
        }, 60 * 1000);

        // test successfully configuring all agents to accept this service account
        it('482717: Configure all agents with service account, as user', async () => {
            const providerCredsFile = JSON.parse(fs.readFileSync(providerCredsPath, 'utf-8')) as ServiceAccountProviderCredentials;
            await callZli(['service-account', 'configure', '--serviceAccount', providerCredsFile.client_email, '--all']);

            if(bzeroTestTargetsToRun.length > 0) {
                // Use a custom configService so that we use the SA as a subject
                // to filter log events in the connect test
                const systemTestSAConfigService = new ConfigService(appName, logger, envMap.configDir, true);
                const testUtils = new TestUtils(systemTestSAConfigService, logger);
                const connectionService = new ConnectionHttpService(systemTestSAConfigService, logger);
                connectTestUtils = new ConnectTestUtils(connectionService, testUtils);

                // Then create our targetConnect policy
                const me = systemTestSAConfigService.me();
                const currentSubject: Subject = {
                    id: me.id,
                    type: me.type
                };
                const environment: Environment = {
                    id: systemTestEnvId
                };

                await policyService.AddTargetConnectPolicy({
                    name: targetConnectPolicyName,
                    subjects: [currentSubject],
                    groups: [],
                    description: `Target connect policy created for service account configure system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                    verbs: [{type: VerbType.Shell},]
                });

                const testTarget = bzeroTestTargetsToRun[0];
                await connectTestUtils.runShellConnectTest(testTarget, `configure service account connect test - ${systemTestUniqueId}`, true, appName);
            }
        }, 60 * 1000);
    });
};
