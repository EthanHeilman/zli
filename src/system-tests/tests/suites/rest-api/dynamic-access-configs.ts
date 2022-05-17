import { RegisterDynamicAccessConfigRequest } from '../../../../../webshell-common-ts/http/v2/target/dynamic/requests/register-dynamic-access-config.requests';
import { DynamicAccessConfigHttpService } from '../../../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { configService, logger, systemTestEnvId, systemTestUniqueId } from '../../system-test';

export const dynamicAccessConfigRestApiSuite = () => {
    describe('Dynamic Access Config REST API Suite', () => {
        let testDynamicAccessConfigData: RegisterDynamicAccessConfigRequest;
        let dynamicAccessConfigService: DynamicAccessConfigHttpService;
        let dynamicAccessConfigId: string;

        beforeAll(() => {
            dynamicAccessConfigService = new DynamicAccessConfigHttpService(configService, logger);
            testDynamicAccessConfigData = {
                name: `dac-test-${systemTestUniqueId}`,
                environmentId: systemTestEnvId,
                healthWebhook: 'https://fakeurl.com/health',
                startWebhook: 'https://fakeurl.com/start',
                stopWebhook: 'https://fakeurl.com/stop'
            };
        });

        afterAll(async () => {
            if (dynamicAccessConfigId) {
                await dynamicAccessConfigService.DeleteDynamicAccessConfig(dynamicAccessConfigId);
            }
        }, 15 * 1000);

        test('6426: Create and verify a dynamic access config', async () => {
            const response = await dynamicAccessConfigService.CreateDynamicAccessConfig({
                ...testDynamicAccessConfigData,
                sharedSecret: 'Z34abDJlyw4l'
            });
            dynamicAccessConfigId = response.id;
            expect(dynamicAccessConfigId).toBeString();

            const dynamicAccessConfig = await dynamicAccessConfigService.GetDynamicAccessConfig(dynamicAccessConfigId);
            expect(dynamicAccessConfig).toMatchObject(testDynamicAccessConfigData);
        }, 15 * 1000);

        test('6428: Get all dynamic access configs', async () => {
            const dynamicAccessConfigs = await dynamicAccessConfigService.ListDynamicAccessConfigs();
            const matchingConfigs = dynamicAccessConfigs.filter(dac => dac.id === dynamicAccessConfigId);
            expect(matchingConfigs.length).toBe(1);
        }, 15 * 1000);

        test('6429: Edit a dynamic access config', async () => {
            // Test modifying a single property.
            await dynamicAccessConfigService.EditDynamicAccessConfig(dynamicAccessConfigId, {
                name: `dac-test-${systemTestUniqueId}-edited`
            });
            let dynamicAccessConfig = await dynamicAccessConfigService.GetDynamicAccessConfig(dynamicAccessConfigId);
            expect(dynamicAccessConfig.name).toEqual(`dac-test-${systemTestUniqueId}-edited`);

            // Test modifying all properties.
            const updatedConfigData = {
                name: `dac-test-${systemTestUniqueId}`,
                healthWebhook: 'http://newfakeurl.com/health',
                startWebhook: 'http://newfakeurl.com/start',
                stopWebhook: 'http://newfakeurl.com/stop'
            };

            await dynamicAccessConfigService.EditDynamicAccessConfig(dynamicAccessConfigId, {
                ...updatedConfigData,
                sharedSecret: 'Z34abDJlyw4k'
            });
            dynamicAccessConfig = await dynamicAccessConfigService.GetDynamicAccessConfig(dynamicAccessConfigId);
            expect(dynamicAccessConfig).toMatchObject(updatedConfigData);
        }, 15 * 1000);

        test('6430: Delete a dynamic access config', async () => {
            await dynamicAccessConfigService.DeleteDynamicAccessConfig(dynamicAccessConfigId);
            // ensure that the dynamic access config no longer exists
            const dynamicAccessConfigs = await dynamicAccessConfigService.ListDynamicAccessConfigs();
            expect(dynamicAccessConfigs.find(dac => dac.id === dynamicAccessConfigId)).toBeUndefined();

            // set id to undefined so that delete isn't attempted again in afterAll
            dynamicAccessConfigId = undefined;
        }, 15 * 1000);
    });
};
