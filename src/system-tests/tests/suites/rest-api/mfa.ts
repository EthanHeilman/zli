import { MfaSummary } from '../../../../../webshell-common-ts/http/v2/mfa/types/mfa-summary.types';
import { MfaHttpService } from '../../../../http-services/mfa/mfa.http-services';
import { configService, logger, RUN_AS_SERVICE_ACCOUNT } from '../../system-test';
import { testIf } from '../../utils/utils';

export const mfaSuite = () => {
    describe('MFA Suite', () => {
        let mfaService: MfaHttpService;
        let subjectId: string;

        beforeAll(() => {
            mfaService = new MfaHttpService(configService, logger);
            subjectId = configService.me().id;
        });

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5603: Get MFA status and verify it is disabled as a user', async () => {
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(false);

            // verify Get by id and Get /me return the same thing
            const mfaSummaryById = await mfaService.GetUserMfaSummary(subjectId);
            expect(mfaSummary).toEqual(mfaSummaryById);
        }, 15 * 1000);

        testIf(RUN_AS_SERVICE_ACCOUNT, '510233: Get MFA status and verify it is enabled for service account', async () => {
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(true);
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5604: Enable MFA and verify it is enabled as a user', async () => {
            await mfaService.EnableMfa(subjectId);
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(true);
            expect(mfaSummary.verified).toBe(false);
        }, 15 * 1000);

        // This can't be tested until we can run tests with more than one user because a user is not allowed
        // to clear their own secret (even admins).
        // test('TODO: MFA should be cleared', async () => {
        //     await mfaService.ClearSecret(userId);
        // }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5605: Reset MFA and verify MfaSummary', async () => {
            const expectedMfaSummary: MfaSummary = {
                enabled: true,
                sessionVerified: false,
                verified: false
            };
            let actualMfaSummary: MfaSummary;

            await mfaService.ResetSecret(false);
            actualMfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(actualMfaSummary).toEqual(expectedMfaSummary);

            await mfaService.DisableMfa(subjectId);
            // forceSetup set to true should enable MFA
            await mfaService.ResetSecret(true);
            actualMfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(actualMfaSummary).toEqual(expectedMfaSummary);
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5606: Disable MFA and verify it is disabled', async () => {
            await mfaService.DisableMfa(subjectId);
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(false);
        }, 15 * 1000);
    });
};