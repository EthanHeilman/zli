import { OPA_SYNC_TIME, configService, datEndpoint, datSecret, logger, resourceNamePrefix, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId } from 'system-tests/tests/system-test';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { TestUtils, sleepTimeout } from 'system-tests/tests/utils/test-utils';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { cleanupTargetConnectPolicies } from 'system-tests/tests/system-test-cleanup';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { ConnectTestUtils } from 'system-tests/tests/utils/connect-utils';
import { DynamicAccessConfigSummary } from 'webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-summary.types';
import { DynamicAccessConfigHttpService } from 'http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { DynamicAccessTargetState } from 'webshell-common-ts/http/v2/connection/types/dynamic-access-target-state';

export type DATBzeroTarget = {
    type: 'dat-bzero',
    awsRegion: string,
    dynamicAccessConfiguration: DynamicAccessConfigSummary
};

export const dynamicAccessSuite = () => {
    describe('dynamic access suite', () => {
        const targetConnectPolicyName = systemTestPolicyTemplate.replace('$POLICY_TYPE', 'dat-connect');

        let policyService: PolicyHttpService;
        let connectionService: ConnectionHttpService;
        let dynamicAccessConfigService: DynamicAccessConfigHttpService;
        let testUtils: TestUtils;
        let connectTestUtils: ConnectTestUtils;
        let dynamicAccessId: string;
        let dynamicAccessTestTarget: DATBzeroTarget;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            connectionService = new ConnectionHttpService(configService, logger);
            dynamicAccessConfigService = new DynamicAccessConfigHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);

            // Create our DAT config
            const response = await dynamicAccessConfigService.CreateDynamicAccessConfig({
                name: `${resourceNamePrefix}-DAT`,
                startWebhook: `${datEndpoint}/start`,
                stopWebhook: `${datEndpoint}/stop`,
                healthWebhook: `${datEndpoint}/health`,
                environmentId: systemTestEnvId,
                sharedSecret: datSecret
            });
            dynamicAccessId = response.id;

            const dynamicAccessConfiguration = await dynamicAccessConfigService.GetDynamicAccessConfig(dynamicAccessId);
            dynamicAccessTestTarget = {
                type: 'dat-bzero',
                awsRegion: 'us-east-1', // Currently have only a single dat provisioning server in us-east-1
                dynamicAccessConfiguration: dynamicAccessConfiguration
            };

            const me = configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // Then create our targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: targetConnectPolicyName,
                subjects: [currentSubject],
                groups: [],
                description: `DAT connect policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: ConnectTestUtils.getPolicyTargetUsers(),
                verbs: [{type: VerbType.Shell},]
            });

            await sleepTimeout(OPA_SYNC_TIME);
        }, 15 * 1000);

        // Called before each case
        beforeEach(() => {
            connectTestUtils = new ConnectTestUtils(connectionService, testUtils);
        });

        // Called after each case
        afterEach(async () => {
            await connectTestUtils.cleanup();
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(targetConnectPolicyName);

            // Delete the DAT target
            await dynamicAccessConfigService.DeleteDynamicAccessConfig(dynamicAccessId);
        }, 60 * 1000);

        test(`3090: Connect to DAT target`, async () => {
            const exit = true;
            const connectionTestResult = await connectTestUtils.runNonTestTargetShellConnectTest(dynamicAccessTestTarget, `DAT connect test - ${systemTestUniqueId}`, exit);

            // After the connection is closed we should eventually see the DAT
            // state move to Stopped once the stop webhook is successfully sent
            await testUtils.waitForExpect(async () => {
                const datConnectionDetails = await connectionService.GetDATConnectionDetails(connectionTestResult.connectionId);
                expect(datConnectionDetails.dynamicAccessTargetState).toBe(DynamicAccessTargetState.Stopped);
            });
        }, 2 * 60 * 1000);
    });
};