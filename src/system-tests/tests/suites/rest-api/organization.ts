import { OrganizationSummary } from '../../../../../webshell-common-ts/http/v2/organization/types/organization-summary.types';
import { OrganizationHttpService } from '../../../../http-services/organization/organization.http-services';
import { API_ENABLED, configService, logger } from '../../system-test';
import { ApiKeyHttpService } from '../../../../http-services/api-key/api-key.http-services';
import 'jest-extended';

export const organizationSuite = () => {
    if (!API_ENABLED) {
        logger.info('Skipping api key suite since API_ENABLED is not enabled');
        return;
    }
    
    describe('Organization Suite', () => {
        console.log("HERE ORG ")
        const organizationService = new OrganizationHttpService(configService, logger);
        const defaultRegApiKeyName = 'Default Organization Registration Key';
        const apiKeyService = new ApiKeyHttpService(configService, logger);

        test('2117: Get users organization', async () => {
            const userOrg = await organizationService.GetUserOrganization();
            const userInfo = configService.me();

            // Ensure that the orgId matches
            const toMatch: OrganizationSummary = {
                id: userInfo.organizationId,
                name: expect.anything(),
                isSingleUserOrganization: false, // System tests does not support single user orgs
                timeCreated: expect.anything()
            };
            expect(userOrg).toEqual(toMatch);
        }, 15 * 1000);

        test('2117: Get org registration key settings', async () => {
            const registrationKeySettings = await organizationService.GetRegistrationKeySettings();
            const toExpect = {
                globalRegistrationKeyEnforced: expect.anything(),
                defaultGlobalRegistrationKey: expect.toBeOneOf([expect.anything(), null]) // If there is no default global reg key, this value will be null
            }
            expect(registrationKeySettings).toMatchObject(toExpect)
        }, 15 * 1000);

        test('2117: Enable global registration key enforcement', async () => {
            // First get the default reg api key
            const allApiKeysResponse = await apiKeyService.ListAllApiKeys();
            const defaultRegKey = allApiKeysResponse.find(k => k.name == defaultRegApiKeyName)

            const enableGlobalRegKeyResponse = await organizationService.EnableGlobalRegistrationKey(defaultRegKey.id);
            const toExpect = {
                globalRegistrationKeyEnforced: true,
                defaultGlobalRegistrationKey: defaultRegKey.id
            }
            expect(enableGlobalRegKeyResponse).toMatchObject(toExpect)
        }, 15 * 1000);

        test('2117: Disable global registration key enforcement', async () => {
            const disableGlobalRegKeyResponse = await organizationService.DisableGlobalRegistrationKey();
            const toExpect = {
                globalRegistrationKeyEnforced: false,
                defaultGlobalRegistrationKey: null as string
            }
            expect(disableGlobalRegKeyResponse).toMatchObject(toExpect)
        }, 15 * 1000);
    });
}