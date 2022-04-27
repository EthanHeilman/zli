import { OrganizationSummary } from '../../../../../webshell-common-ts/http/v2/organization/types/organization-summary.types';
import { OrganizationHttpService } from '../../../../http-services/organization/organization.http-services';
import { configService, GROUP_ID, GROUP_NAME, IN_CI, logger, SERVICE_URL, systemTestRegistrationApiKey } from '../../system-test';
import { ApiKeyHttpService } from '../../../../http-services/api-key/api-key.http-services';
import 'jest-extended';

export const organizationSuite = () => {
    describe('Organization Suite', () => {
        let organizationService : OrganizationHttpService;
        let apiKeyService : ApiKeyHttpService;
        let getGroupsCaseId: string;
        let fetchGroupsCaseId: string;

        // Set our test caseIds based on the IDP we are configured against
        switch (configService.idp()) {
        case 'google':
            getGroupsCaseId = '3103';
            fetchGroupsCaseId = '3100';
            break;
        case 'okta':
            getGroupsCaseId = '3105';
            fetchGroupsCaseId = '3102';
            break;
        case 'microsoft':
            getGroupsCaseId = '3104';
            fetchGroupsCaseId = '3101';
            break;
        default:
            throw new Error(`Unhandled IDP passed: ${configService.idp()}`);
        }

        beforeAll(() => {
            apiKeyService = new ApiKeyHttpService(configService, logger);
            organizationService = new OrganizationHttpService(configService, logger);
        });

        test('2263: Get users organization', async () => {
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

        test('2264: Get org registration key settings', async () => {
            const registrationKeySettings = await organizationService.GetRegistrationKeySettings();
            const toExpect = {
                globalRegistrationKeyEnforced: expect.anything(),
                defaultGlobalRegistrationKey: expect.toBeOneOf([expect.anything(), null]) // If there is no default global reg key, this value will be null
            };
            expect(registrationKeySettings).toMatchObject(toExpect);
        }, 15 * 1000);

        test('2265: Enable global registration key enforcement', async () => {
            // First get our system test reg api key
            const allApiKeysResponse = await apiKeyService.ListAllApiKeys();
            const defaultRegKey = allApiKeysResponse.find(k => k.name == systemTestRegistrationApiKey.apiKeyDetails.name);

            const enableGlobalRegKeyResponse = await organizationService.EnableGlobalRegistrationKey(defaultRegKey.id);
            const toExpect = {
                globalRegistrationKeyEnforced: true,
                defaultGlobalRegistrationKey: defaultRegKey.id
            };
            expect(enableGlobalRegKeyResponse).toMatchObject(toExpect);
        }, 15 * 1000);

        test('2266: Disable global registration key enforcement', async () => {
            const disableGlobalRegKeyResponse = await organizationService.DisableGlobalRegistrationKey();
            const toExpect = {
                globalRegistrationKeyEnforced: false,
                defaultGlobalRegistrationKey: null as string
            };
            expect(disableGlobalRegKeyResponse).toMatchObject(toExpect);
        }, 15 * 1000);

        test(`${fetchGroupsCaseId}: Fetch groups from the identity provider`, async () => {
            // Only run this test if we are in CI and talking to staging or dev
            if (IN_CI && (SERVICE_URL.includes('cloud-dev') || SERVICE_URL.includes('cloud-staging'))) {
                const groups = await organizationService.FetchGroups();
                const expectedGroup = groups.find(group => group.idPGroupId == GROUP_ID && group.name == GROUP_NAME);
                expect(expectedGroup).toBeDefined();
            } else {
                logger.info(`Skipping groups based endpoint as IN_CI is set to false`);
            }
        });

        // Test our group based endpoints
        test(`${getGroupsCaseId}: Get Groups configured for this org`, async () => {
            // Only run this test if we are in CI and talking to staging or dev
            if (IN_CI && (SERVICE_URL.includes('cloud-dev') || SERVICE_URL.includes('cloud-staging'))) {
                const groups = await organizationService.ListGroups();
                const expectedGroup = groups.find(group => group.idPGroupId == GROUP_ID && group.name == GROUP_NAME);
                expect(expectedGroup).toBeDefined();
            } else {
                logger.info(`Skipping groups based endpoint as IN_CI is set to false`);
            }
        });

    });
};