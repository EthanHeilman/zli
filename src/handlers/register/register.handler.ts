import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import { UserHttpService } from 'http-services/user/user.http-services';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { cleanExit } from 'handlers/clean-exit.handler';
import { MfaActionRequired } from 'webshell-common-ts/http/v2/mfa/types/mfa-action-required.types';
import { MfaHttpService } from 'http-services/mfa/mfa.http-services';
import { OAuthService } from 'services/oauth/oauth.service';
import { extractMfaSecretFromUrl } from 'utils/utils';
import totp from 'totp-generator';

export async function registerHandler(mfaSecret: string, configService: ConfigService, logger: Logger) {
    const userHttpService = await UserHttpService.init(configService, logger);
    const subjectHttpService = await SubjectHttpService.init(configService, logger);
    const oauthService = new OAuthService(configService, logger);

    // Force refresh ID token and access token because it is likely expired in system tests
    // We are force refreshing the tokens so register does not need to be an oauth command
    const newTokenSet = await oauthService.refresh();

    try {
        await configService.setTokenSet(newTokenSet);
    } catch (e) {
        logger.error(`Failed to save tokens after oath refresh: ${e}`);
        await cleanExit(1, logger);
    }

    const resp = await userHttpService.Register();
    const mfaService = await MfaHttpService.init(configService, logger);

    if(resp.mfaActionRequired == MfaActionRequired.TOTP) {
        if(!mfaSecret) {
            logger.error('Mfa secret not provided for totp');
            await cleanExit(1, logger);
        }
        const totpPasscode = totp(mfaSecret);
        await mfaService.VerifyMfaTotp(totpPasscode);
    } else if (resp.mfaActionRequired == MfaActionRequired.RESET || resp.mfaActionRequired == MfaActionRequired.RESET_DEFER_ALLOWED) {
        // Call reset to create new mfa secret
        const resetResp = await mfaService.ResetSecret(true);
        const mfaSecretUrl = resetResp.mfaSecretUrl;

        // Extract the secret from the url returned by reset
        const base32Secret = extractMfaSecretFromUrl(mfaSecretUrl);
        // Print secret to be able to extract it in system tests
        console.log(`Returned mfa secret: ${base32Secret}`);

        // Create totp using base32Secret and verify it
        const totpPasscode = totp(base32Secret);
        await mfaService.VerifyMfaTotp(totpPasscode);
    }

    // Update me
    const me = await subjectHttpService.Me();
    configService.setMe(me);
    await cleanExit(0, logger);
}
