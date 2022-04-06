import { CreateEnvironmentResponse } from '../../../../../webshell-common-ts/http/v2/environment/responses/create-environment.responses';
import { environmentService, systemTestUniqueId } from "../../system-test";

export const environmentsSuite = () => {
    describe('Environments Suite', () => {
        let createEnvResponse: CreateEnvironmentResponse = undefined;
        const environmentName = `environment-test-suite-${systemTestUniqueId}`;

        afterAll(async () => {
            // If we have gotten a env response, always attempt to delete it
            if (createEnvResponse !== undefined) {
                await environmentService.DeleteEnvironment(createEnvResponse.id);
            }
        });

        test('2117: Create environment', async () => {
            createEnvResponse = await environmentService.CreateEnvironment({
                name: environmentName,
                description: `System test environment suite for run: ${systemTestUniqueId}`,
                offlineCleanupTimeoutHours: 1
            });
        }, 15 * 1000);

        test('2117: Get all environments', async () => {
            const getEnvsResponse = await environmentService.ListEnvironments();
            const foundEnv = getEnvsResponse.find(e => e.id === createEnvResponse.id);
            expect(foundEnv).toMatchObject(createEnvResponse);
        }, 15 * 1000);

        test('2117: Get single environment', async () => {
            const getEnvResponse = await environmentService.GetEnvironment(createEnvResponse.id);
            expect(getEnvResponse).toMatchObject(createEnvResponse);
        }, 15 * 1000);

        test('2117: Edit environment', async () => {
            // Edit the environment offline cleanup and description
            const updatedDescription = `System test environment suite for run: ${systemTestUniqueId} (updated)`;
            const updatedOfflineCleanupTimeout = 2;
            await environmentService.EditEnvironment(createEnvResponse.id, {
                description: updatedDescription,
                offlineCleanupTimeoutHours: updatedOfflineCleanupTimeout
            });

            // Now make sure that the environment has been updated
            const getEnvResponse = await environmentService.GetEnvironment(createEnvResponse.id);
            expect(getEnvResponse.description).toEqual(updatedDescription);
            expect(getEnvResponse.offlineCleanupTimeoutHours).toEqual(updatedOfflineCleanupTimeout);
        }, 15 * 1000);

        test('2117: Delete environment', async () => {
            await environmentService.DeleteEnvironment(createEnvResponse.id);

            // Ensure we cannot find the environment anymore
            const getEnvsResponse = await environmentService.ListEnvironments();
            const foundEnv = getEnvsResponse.find(e => e.id === createEnvResponse.id);
            expect(foundEnv == undefined).toBe(true);

            // Ensure we do not try to delete it again by setting this value to undefined
            createEnvResponse = undefined;
        }, 15 * 1000);

    });
}