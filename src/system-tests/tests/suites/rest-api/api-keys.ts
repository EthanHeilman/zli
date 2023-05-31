import { ApiKeyHttpService } from 'http-services/api-key/api-key.http-services';
import { NewApiKeyResponse } from 'webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';
import { ApiKeySummary } from 'webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { configService, logger, resourceNamePrefix } from 'system-tests/tests/system-test';

export const apiKeySuite = () => {
    describe('API Keys Suite', () => {
        const apiOnlyKeyName = `${resourceNamePrefix}-APIOnlyKey`;
        const registrationKeyName = `${resourceNamePrefix}-RegistrationKey`;
        let apiKeyService : ApiKeyHttpService;

        let expectedApiOnlyKeySummary: ApiKeySummary;
        let expectedRegistrationKeySummary: ApiKeySummary;
        let apiOnlyKey: NewApiKeyResponse;
        let registrationKey: NewApiKeyResponse;

        beforeAll(async () => {
            expectedApiOnlyKeySummary = {
                id: expect.any('string'),
                isRegistrationKey: false,
                name: apiOnlyKeyName,
                timeCreated: expect.anything()
            };
            expectedRegistrationKeySummary = {
                id: expect.any('string'),
                isRegistrationKey: true,
                name: registrationKeyName,
                timeCreated: expect.anything()
            };

            apiKeyService = await ApiKeyHttpService.init(configService, logger);
        });

        afterAll(async () => {
            if (apiOnlyKey) {
                await apiKeyService.DeleteApiKey(apiOnlyKey.apiKeyDetails.id);
            }

            if (registrationKey) {
                await apiKeyService.DeleteApiKey(registrationKey.apiKeyDetails.id);
            }
        });

        test('2255: Create and verify API keys', async () => {
            apiOnlyKey = await apiKeyService.CreateNewApiKey({
                isRegistrationKey: expectedApiOnlyKeySummary.isRegistrationKey,
                name: expectedApiOnlyKeySummary.name
            });

            registrationKey = await apiKeyService.CreateNewApiKey({
                isRegistrationKey: expectedRegistrationKeySummary.isRegistrationKey,
                name: expectedRegistrationKeySummary.name
            });

            // verify the keys were created as specified
            const apiOnlyKeySummary = await apiKeyService.GetApiKey(apiOnlyKey.apiKeyDetails.id);
            expectedApiOnlyKeySummary.id = apiOnlyKey.apiKeyDetails.id;
            expect(apiOnlyKeySummary).toMatchObject(expectedApiOnlyKeySummary);

            expectedRegistrationKeySummary.id = registrationKey.apiKeyDetails.id;
            const registrationKeySummary = await apiKeyService.GetApiKey(registrationKey.apiKeyDetails.id);
            expect(registrationKeySummary).toMatchObject(expectedRegistrationKeySummary);
        }, 15 * 1000);

        test('2256: Edit API keys', async () => {
            expectedApiOnlyKeySummary.name += '-updated';
            expectedRegistrationKeySummary.name += '-updated';

            const apiOnlyKeySummary = await apiKeyService.EditApiKey(apiOnlyKey.apiKeyDetails.id, {
                name: expectedApiOnlyKeySummary.name
            });
            expect(apiOnlyKeySummary).toMatchObject(expectedApiOnlyKeySummary);

            const registrationKeySummary = await apiKeyService.EditApiKey(registrationKey.apiKeyDetails.id, {
                name: expectedRegistrationKeySummary.name
            });
            expect(registrationKeySummary).toMatchObject(expectedRegistrationKeySummary);
        }, 15 * 1000);

        test('2257: Get all API keys', async () => {
            const allApiKeys = await apiKeyService.ListAllApiKeys();
            expect(allApiKeys.length).toBeGreaterThanOrEqual(2);
            const foundApiOnlyKey = allApiKeys.find(apiKey => apiKey.id === apiOnlyKey.apiKeyDetails.id);
            expect(foundApiOnlyKey).toMatchObject(expectedApiOnlyKeySummary);
            const foundRegKey = allApiKeys.find(apiKey => apiKey.id === registrationKey.apiKeyDetails.id);
            expect(foundRegKey).toMatchObject(expectedRegistrationKeySummary);
        }, 15 * 1000);

        test('2258: Delete API keys', async () => {
            await apiKeyService.DeleteApiKey(apiOnlyKey.apiKeyDetails.id);
            await apiKeyService.DeleteApiKey(registrationKey.apiKeyDetails.id);
            const allApiKeys = await apiKeyService.ListAllApiKeys();
            expect(allApiKeys.find(apiKey => apiKey.id === apiOnlyKey.apiKeyDetails.id)).toBeUndefined();
            expect(allApiKeys.find(apiKey => apiKey.id === registrationKey.apiKeyDetails.id)).toBeUndefined();

            // set values to undefined so afterAll does not try to delete them again
            apiOnlyKey = undefined;
            registrationKey = undefined;
        }, 15 * 1000);
    });
};