import { OrganizationSummary } from '../../../../../webshell-common-ts/http/v2/organization/types/organization-summary.types';
import { OrganizationHttpService } from '../../../../http-services/organization/organization.http-services';
import { configService, GROUP_ID, GROUP_NAME, IN_CI, logger, SERVICE_URL, systemTestRegistrationApiKey } from '../../system-test';
import { ApiKeyHttpService } from '../../../../http-services/api-key/api-key.http-services';
import 'jest-extended';
import { GroupSummary } from '../../../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { OrgBZCertValidationInfo } from '../../../../../webshell-common-ts/http/v2/organization/types/organization-bzcert-validation-info.types';

export const organizationSuite = () => {
    describe('Organization Suite', () => {
        let organizationService : OrganizationHttpService;
        let apiKeyService : ApiKeyHttpService;
        let getGroupsCaseId: string;
        let fetchGroupsCaseId: string;
        let orgProvider: string;
        let orgIssuerId: string;

        // Set our test caseIds based on the IDP we are configured against
        switch (configService.getIdp()) {
        case 'google':
            orgProvider = 'google';
            // thoum.org google organization
            orgIssuerId = 'thoum.org';
            getGroupsCaseId = '3103';
            fetchGroupsCaseId = '3100';
            break;
        case 'okta':
            orgProvider = 'okta';
            // https://bastionzero.okta.com/
            orgIssuerId = 'bastionzero';
            getGroupsCaseId = '3105';
            fetchGroupsCaseId = '3102';
            break;
        case 'onelogin':
            orgProvider = 'onelogin';
            // https://bastionzero.onelogin.com/
            orgIssuerId = 'bastionzero';
            getGroupsCaseId = '658655';
            fetchGroupsCaseId = '658654';
            break;
        case 'microsoft':
            orgProvider = 'microsoft';
            // Tenant ID for b0demo.onmicrosoft.com
            orgIssuerId = 'd30ebcf9-4155-4870-aac0-ba63310ec216';
            getGroupsCaseId = '3104';
            fetchGroupsCaseId = '3101';
            break;
        default:
            throw new Error(`Unhandled IDP passed: ${configService.getIdp()}`);
        }

        beforeAll(() => {
            apiKeyService = new ApiKeyHttpService(configService, logger);
            organizationService = new OrganizationHttpService(configService, logger);
        });

        test('2263: Get user\'s organization', async () => {
            const subjectOrg = await organizationService.GetUserOrganization();
            const subjectInfo = configService.me();

            // Ensure that the orgId matches
            const toMatch: OrganizationSummary = {
                id: subjectInfo.organizationId,
                name: expect.anything(),
                isSingleUserOrganization: false, // System tests does not support single user orgs
                timeCreated: expect.anything()
            };
            expect(subjectOrg).toEqual(toMatch);
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

        test('110600: Get Organization BZCert Validation Info', async () => {
            const bzCertValidationInfo = await organizationService.GetUserOrganizationBZCertValidationInfo();

            const toExpect: OrgBZCertValidationInfo = {
                orgIdpIssuerId: orgIssuerId,
                orgIdpProvider: orgProvider
            };
            expect(bzCertValidationInfo).toMatchObject(toExpect);
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
                expect(groups).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining<GroupSummary>({name: GROUP_NAME, idPGroupId: GROUP_ID}),
                    ])
                );
            } else {
                logger.info(`Skipping groups based endpoint as IN_CI is set to false`);
            }
        });

        // Test our group based endpoints
        test(`${getGroupsCaseId}: Get Groups configured for this org`, async () => {
            // Only run this test if we are in CI and talking to staging or dev
            if (IN_CI && (SERVICE_URL.includes('cloud-dev') || SERVICE_URL.includes('cloud-staging'))) {
                const groups = await organizationService.ListGroups();
                expect(groups).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining<GroupSummary>({name: GROUP_NAME, idPGroupId: GROUP_ID}),
                    ])
                );
            } else {
                logger.info(`Skipping groups based endpoint as IN_CI is set to false`);
            }
        });

    });
};