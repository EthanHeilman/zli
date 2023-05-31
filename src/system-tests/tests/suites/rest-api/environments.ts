import { EnvironmentSummary } from 'webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { CreateEnvironmentResponse } from 'webshell-common-ts/http/v2/environment/responses/create-environment.responses';
import { configService, logger, resourceNamePrefix, systemTestUniqueId } from 'system-tests/tests/system-test';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';

export const environmentsSuite = () => {
    describe('Environments Suite', () => {
        let createEnvResponse: CreateEnvironmentResponse = undefined;
        let envToExpect: EnvironmentSummary = undefined;
        const environmentName = `${resourceNamePrefix}-environment-test-suite`;
        let environmentService : EnvironmentHttpService;

        beforeAll(() => {
            environmentService = new EnvironmentHttpService(configService, logger);
        });

        afterAll(async () => {
            // If we have gotten a env response, always attempt to delete it
            if (createEnvResponse !== undefined) {
                await environmentService.DeleteEnvironment(createEnvResponse.id);
            }
        });

        test('2259: Create and verify environment', async () => {
            const envDescription = `System test environment suite for run: ${systemTestUniqueId}`;
            createEnvResponse = await environmentService.CreateEnvironment({
                name: environmentName,
                description: envDescription,
                offlineCleanupTimeoutHours: 1
            });
            envToExpect = {
                id : createEnvResponse.id,
                organizationId : (await configService.me()).organizationId,
                isDefault : false,
                name : environmentName,
                description : envDescription,
                timeCreated : expect.anything(),
                offlineCleanupTimeoutHours : 1,
                targets : [],
            };

            const getEnvsResponse = await environmentService.ListEnvironments();
            const foundEnv = getEnvsResponse.find(e => e.id === createEnvResponse.id);
            expect(foundEnv).toMatchObject(envToExpect);
        }, 15 * 1000);

        test('2260: Get single environment', async () => {
            const getEnvResponse = await environmentService.GetEnvironment(createEnvResponse.id);
            expect(getEnvResponse).toMatchObject(envToExpect);
        }, 15 * 1000);

        test('2261: Edit environment', async () => {
            // Edit the environment offline cleanup and description
            const updatedDescription = `System test environment suite for run: ${systemTestUniqueId} (updated)`;
            const updatedOfflineCleanupTimeout = 2;
            await environmentService.EditEnvironment(createEnvResponse.id, {
                description: updatedDescription,
                offlineCleanupTimeoutHours: updatedOfflineCleanupTimeout
            });

            // Now make sure that the environment has been updated
            const getEnvResponse = await environmentService.GetEnvironment(createEnvResponse.id);
            envToExpect.description = updatedDescription;
            envToExpect.offlineCleanupTimeoutHours = updatedOfflineCleanupTimeout;
            expect(getEnvResponse).toMatchObject(envToExpect);
        }, 15 * 1000);

        test('2262: Delete environment', async () => {
            await environmentService.DeleteEnvironment(createEnvResponse.id);

            // Ensure we cannot find the environment anymore
            const getEnvsResponse = await environmentService.ListEnvironments();
            const foundEnv = getEnvsResponse.find(e => e.id === createEnvResponse.id);
            expect(foundEnv == undefined).toBe(true);

            // Ensure we do not try to delete it again by setting this value to undefined
            createEnvResponse = undefined;
        }, 15 * 1000);

    });
};