import { ApiKeyHttpService } from '../../../../http-services/api-key/api-key.http-services';
import { NewApiKeyResponse } from '../../../../../webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';
import { ApiKeySummary } from '../../../../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { configService, logger, systemTestUniqueId } from '../../system-test';

export const apiKeySuite = () => {
    describe('API Keys Suite', () => {
        const apiOnlyKeyName = `${systemTestUniqueId}-APIOnlyKey`;
        const registrationKeyName = `${systemTestUniqueId}-RegistrationKey`;
        const apiKeyService = new ApiKeyHttpService(configService, logger);

        let expectedApiOnlyKeySummary: ApiKeySummary;
        let expectedRegistrationKeySummary: ApiKeySummary;
        let apiOnlyKey: NewApiKeyResponse;
        let registrationKey: NewApiKeyResponse;

        beforeAll(() => {
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
        });

        afterAll(async () => {
            if (apiOnlyKey) {
                await apiKeyService.DeleteApiKey(apiOnlyKey.apiKeyDetails.id);
            }

            if (registrationKey) {
                await apiKeyService.DeleteApiKey(registrationKey.apiKeyDetails.id);
            }
        });

        test('2117: Create and verify API keys', async () => {
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

        test('2117: Edit API keys', async () => {
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

        test('2117: Get all API keys', async () => {
            const allApiKeys = await apiKeyService.ListAllApiKeys();
            expect(allApiKeys.length).toBeGreaterThanOrEqual(2);
            const foundApiOnlyKey = allApiKeys.find(apiKey => apiKey.id === apiOnlyKey.apiKeyDetails.id);
            expect(foundApiOnlyKey).toMatchObject(expectedApiOnlyKeySummary);
            const foundRegKey = allApiKeys.find(apiKey => apiKey.id === registrationKey.apiKeyDetails.id);
            expect(foundRegKey).toMatchObject(expectedRegistrationKeySummary);
        }, 15 * 1000);

        test('2117: Delete all API keys', async () => {
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
}