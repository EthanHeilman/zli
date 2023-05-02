import { MfaSummary } from '../../../../../webshell-common-ts/http/v2/mfa/types/mfa-summary.types';
import { MfaHttpService } from '../../../../http-services/mfa/mfa.http-services';
import { configService, logger, RUN_AS_SERVICE_ACCOUNT } from '../../system-test';
import { ensureMfaEnabled } from '../../system-test-setup';
import { extractMfaSecretFromUrl } from '../../../../../src/utils/utils';
import { testIf } from '../../utils/utils';
import totp from 'totp-generator';

export const mfaSuite = () => {
    describe('MFA Suite', () => {
        let mfaService: MfaHttpService;
        let subjectId: string;
        let mfaSecretAfterReset: string;

        beforeAll(async () => {
            mfaService = new MfaHttpService(configService, logger);
            subjectId = configService.me().id;

            // ensure mfa is enabled before tests have run
            await ensureMfaEnabled(mfaService);
        });

        afterAll(async () => {
            if(!RUN_AS_SERVICE_ACCOUNT) {
                // disable mfa after all tests have run
                await mfaService.DisableMfa(subjectId);
            }
        });

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5603: Get MFA status and expect it to be enabled as a user', async () => {
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(true);

            // verify Get by id and Get /me return the same thing
            const mfaSummaryById = await mfaService.GetUserMfaSummary(subjectId);
            expect(mfaSummary).toEqual(mfaSummaryById);
        }, 15 * 1000);

        testIf(RUN_AS_SERVICE_ACCOUNT, '510233: Get MFA status and expect it to be enabled for service account', async () => {
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(true);
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5606: Disable MFA and expect it to be disabled', async () => {
            await mfaService.DisableMfa(subjectId);
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(false);
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5604: Enable MFA and expect it to be enabled as a user', async () => {
            await mfaService.EnableMfa(subjectId);
            const mfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(mfaSummary.enabled).toBe(true);
            expect(mfaSummary.verified).toBe(false);
            expect(mfaSummary.gracePeriodEndTime).toBe(null); // The grace period implementation relies on ths being initialized to null.
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '5605: Reset MFA and check MfaSummary', async () => {
            const expectedMfaSummary: MfaSummary = {
                enabled: true,
                sessionVerified: false,
                verified: false,
                gracePeriodEndTime: null
            };

            const mfaResetResp = await mfaService.ResetSecret(false);
            // Save the mfa secret that's returned for verify totp test
            mfaSecretAfterReset = extractMfaSecretFromUrl(mfaResetResp.mfaSecretUrl);

            const actualMfaSummary: MfaSummary = await mfaService.GetCurrentUserMfaSummary();
            expect(actualMfaSummary).toEqual(expectedMfaSummary);
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, '544005: Verify MFA with TOTP after resetting secret', async () => {
            expect(mfaSecretAfterReset).toBeDefined();
            const totpPasscode = totp(mfaSecretAfterReset);
            await expect(mfaService.VerifyMfaTotp(totpPasscode)).resolves.not.toThrow();
        }, 15 * 1000);

        // TODO once we can run tests with more than one user because a user is not allowed
        // to clear their own secret (even admins).
        // test('TODO: MFA should be cleared', async () => {
        //     await mfaService.ClearSecret(userId);
        // }, 15 * 1000);
    });
};