import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { OAuthService } from 'services/oauth/oauth.service';
import { MrtapService } from 'webshell-common-ts/mrtap.service/mrtap.service';

import jwt, { JwtHeader, SignOptions } from 'jsonwebtoken';
import { TokenSet } from 'openid-client';

import fs from 'fs';
import qrcode from 'qrcode';
import yargs from 'yargs';
import { loginArgs } from 'handlers/login/login.command-builder';
import prompts, { PromptObject } from 'prompts';
import { MfaHttpService } from 'http-services/mfa/mfa.http-services';
import { UserHttpService } from 'http-services/user/user.http-services';
import { MfaActionRequired } from 'webshell-common-ts/http/v2/mfa/types/mfa-action-required.types';
import { ServiceAccountProviderCredentials } from 'handlers/login/types/service-account-provider-credentials.types';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';
import { LoginServiceAccountRequest } from 'webshell-common-ts/http/v2/service-account/requests/login-service-account.requests';
import totp from 'totp-generator';
import { cleanExit } from 'handlers/clean-exit.handler';
import { ServiceAccountBzeroCredentials } from 'handlers/login/types/service-account-bzero-credentials.types';
import { ServiceAccountAccessToken } from 'handlers/login/types/service-account-access-token.types';
import { ServiceAccountIdToken } from 'handlers/login/types/service-account-id-token.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { serviceAccountLoginArgs } from 'handlers/service-account/service-account-login.command-builder';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { GCPJwksURLPrefix, GCPTokenUri } from 'handlers/service-account/create-service-account.handler';

const oneWeek : number = 60*60*24*7;
const oneWeekFromNow : number = Math.floor(Date.now()/1000) + oneWeek;


export interface LoginResult {
    subjectSummary: SubjectSummary;
}

function interactiveTOTPMFA(): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, _) => {
        const onCancel = () => resolve(undefined);
        const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
        await prompts({
            type: 'text',
            name: 'value',
            message: 'Enter MFA code:',
            validate: value => value ? true : 'Value is required. Use CTRL-C to exit'
        }, { onSubmit: onSubmit, onCancel: onCancel });
    });
}

function interactiveResetMfa(): Promise<string> {
    return new Promise<string | undefined>(async (resolve, _) => {
        const onCancel = () => resolve(undefined);
        const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
        await prompts({
            type: 'text',
            name: 'value',
            message: 'Enter MFA code from authenticator app:',
            validate: value => value ? true : 'Value is required. Use CTRL-C to exit'
        }, { onSubmit: onSubmit, onCancel: onCancel });
    });
}

function interactiveSetUpMfaOption(): Promise<boolean> {
    return new Promise<boolean | undefined>(async (resolve, _) => {
        const onCancel = () => resolve(undefined);
        const onSubmit = (_: PromptObject, answer: boolean) => resolve(answer);
        await prompts({
            type: 'confirm',
            name: 'confirmed',
            message: `Do you want to set up MFA now?`,
        }, { onSubmit: onSubmit, onCancel: onCancel });
    });
}

async function setUpMfa(mfaHttpService: MfaHttpService, logger: Logger): Promise<boolean> {
    logger.info('Please scan the QR code with your authenticator app or enter the secret key. Then, complete setup by entering an MFA code below.');

    const resp = await mfaHttpService.ResetSecret(true);
    // Small size rendering is broken on Mac terminals. See https://github.com/soldair/node-qrcode/issues/322.
    const useSmallQrCode = process.platform !== 'darwin';
    const data = await qrcode.toString(resp.mfaSecretUrl, { type: 'terminal', small: useSmallQrCode });
    const secretRegEx = /secret=(?<base32Secret>\w*)\&/;
    const matches = resp.mfaSecretUrl.match(secretRegEx);
    const base32Secret = matches?.groups.base32Secret;
    console.log(data);
    logger.info(`Secret key: ${base32Secret}`);

    const code = await interactiveResetMfa();
    if (code) {
        await mfaHttpService.VerifyMfaTotp(code);
        logger.info('MFA configured successfully');
        return true;
    }

    return false;
}

export async function loginUserHandler(configService: ConfigService, logger: Logger, mrtapService: MrtapService, argv: yargs.Arguments<loginArgs> = null): Promise<LoginResult | undefined> {
    logger.info('Login required, opening browser');

    // Clear previous log in info
    await configService.logout();

    try {
        await mrtapService.generateMrtapLoginData();

        // Can only create oauth service after loginSetup completes
        const oAuthService = new OAuthService(configService, logger);

        if (!await oAuthService.isAuthenticated()) {
            // Create our Nonce
            const nonce = mrtapService.createNonce();
            // Pass it in as we login
            await oAuthService.login(async (t) => {
                await configService.setTokenSet(t);
                await mrtapService.setInitialIdToken(await configService.getIdToken());
            }, nonce);
        }
    } catch (e) {
        logger.error(`Failed to login
        ${e}
        Please use \'zli send-logs\' to send us your zli and target logs and get in contact with the BastionZero team at support@bastionzero.com.`);
        return undefined;
    }

    // Register user log in and get User Session Id and Session Token
    const userHttpService = new UserHttpService(configService, logger);
    const registerResponse = await userHttpService.Register();

    // Check if we must MFA and act upon it
    const mfaHttpService = new MfaHttpService(configService, logger);
    switch (registerResponse.mfaActionRequired) {
    case MfaActionRequired.NONE:
        break;
    case MfaActionRequired.TOTP:
        if (argv?.mfa) {
            await mfaHttpService.VerifyMfaTotp(argv?.mfa);
        } else {
            logger.info('MFA code required for this account');
            const token = await interactiveTOTPMFA();
            if (token) {
                await mfaHttpService.VerifyMfaTotp(token);
            } else {
                return undefined;
            }
        }
        break;
    case MfaActionRequired.RESET:
        logger.info('MFA setup is required before you can continue.');
        const success = await setUpMfa(mfaHttpService, logger);
        if (!success) {
            return undefined;
        }
        break;
    case MfaActionRequired.RESET_DEFER_ALLOWED:
        logger.info('BastionZero requires multi-factor authentication (MFA) to provide trustless access to your infrastructure.');
        const mfaSummary = await mfaHttpService.GetCurrentUserMfaSummary();
        const millisecondsInADay = 24 * 60 * 60 * 1000;
        const currentDayAtMidnight = new Date().setUTCHours(0, 0, 0, 0);
        const targetDayAtMindnight = new Date(mfaSummary.gracePeriodEndTime).setUTCHours(0, 0, 0, 0);
        const remainingGracePeriodDays = (targetDayAtMindnight - currentDayAtMidnight) / millisecondsInADay;
        logger.info(`You have ${remainingGracePeriodDays} ${remainingGracePeriodDays === 1 ? 'day' : 'days'} until MFA setup is mandatory.`);

        const setUpNow = await interactiveSetUpMfaOption();
        if (setUpNow) {
            const success = await setUpMfa(mfaHttpService, logger);
            if (!success) {
                // Since the user is within their MFA setup grace period, they are allowed to log in
                // regardless of the outcome of the MFA setup.
                logger.info('MFA setup bypassed. Login successful.');
            }
        } else {
            logger.info('MFA setup postponed');
        }
        break;
    default:
        logger.warn(`Unexpected MFA response ${registerResponse.mfaActionRequired}`);
        break;
    }
    const subjectHttpService = new SubjectHttpService(configService, logger);
    const me = await subjectHttpService.Me();
    configService.setMe(me);

    return {
        subjectSummary: me
    };
}

export async function loginServiceAccountHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<serviceAccountLoginArgs>, mrtapService: MrtapService): Promise<LoginResult | undefined> {
    logger.info('Login required, reading service account credentials from files');

    // Clear previous log in info
    await configService.logout();


    let bzeroCredsFile: ServiceAccountBzeroCredentials = null;
    try {
        await mrtapService.generateMrtapLoginData();

        // Can only create oauth service after loginSetup completes
        const oAuthService = new OAuthService(configService, logger);

        if (!await oAuthService.isAuthenticated()) {
            // Create our Nonce
            const nonce = mrtapService.createNonce();
            const providerCredsFile = JSON.parse(fs.readFileSync(argv.providerCreds, 'utf-8')) as ServiceAccountProviderCredentials;
            bzeroCredsFile = JSON.parse(fs.readFileSync(argv.bzeroCreds, 'utf-8')) as ServiceAccountBzeroCredentials;
            const t = createGCPServiceAccountTokenSet(providerCredsFile, bzeroCredsFile, nonce, configService.getServiceUrl());
            await configService.setTokenSet(t);
            await mrtapService.setInitialIdToken(await configService.getIdToken());
        }
    } catch (e) {
        logger.error(`Failed to login
        ${e}
        Please use \'zli send-logs\' to send us your zli and target logs and get in contact with the BastionZero team at support@bastionzero.com.`);
        return undefined;
    }

    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
    if(bzeroCredsFile == null)
        bzeroCredsFile = JSON.parse(fs.readFileSync(argv.bzeroCreds, 'utf-8')) as ServiceAccountBzeroCredentials;
    if(!bzeroCredsFile.mfa_secret) {
        logger.error('Invalid mfa secret in the provided bz creds file');
        await cleanExit(1, logger);
        return;
    }
    const totpPasscode = totp(bzeroCredsFile.mfa_secret);
    const req: LoginServiceAccountRequest = {
        totpPasscode: totpPasscode
    };
    const serviceAccountSummary = await serviceAccountHttpService.LoginServiceAccount(req);
    if(!serviceAccountSummary.enabled) {
        logger.error(`Service account ${serviceAccountSummary.email} is not currently enabled.`);
        await cleanExit(1, logger);
    }
    const subjectHttpService = new SubjectHttpService(configService, logger);
    const me = await subjectHttpService.Me();
    configService.setMe(me);

    return {
        subjectSummary: me
    };
}

function createGCPServiceAccountTokenSet(providerCredsFile: ServiceAccountProviderCredentials, bzeroCredsFile: ServiceAccountBzeroCredentials, nonce: string, audience: string) : TokenSet {
    const idToken: ServiceAccountIdToken = {
        aud: audience,
        azp: providerCredsFile.client_id,
        email: providerCredsFile.client_email,
        email_verified: true,
        exp: oneWeekFromNow,
        org_id: bzeroCredsFile.org_id,
        iss: providerCredsFile.client_email,
        nonce: nonce,
        sub: providerCredsFile.client_id,
        iat: Math.floor(Date.now()/1000)
    };

    const accessToken: ServiceAccountAccessToken = {
        aud: audience,
        azp: providerCredsFile.client_id,
        email: providerCredsFile.client_email,
        email_verified: true,
        exp: oneWeekFromNow,
        org_id: bzeroCredsFile.org_id,
        iss: providerCredsFile.client_email,
        nonce: nonce,
        sub: providerCredsFile.client_id,
        iat: Math.floor(Date.now()/1000),
        type: 'Access Token'
    };

    let jwksURL: string;
    // If this is a GCP service account
    if(providerCredsFile.token_uri == GCPTokenUri)
        jwksURL = GCPJwksURLPrefix + providerCredsFile.client_email;
    else
        jwksURL = providerCredsFile.jwksURL;

    const JWTHeader: JwtHeader = {
        alg: 'RS256',
        kid: providerCredsFile.private_key_id,
        jku: jwksURL,
    };

    const JWTOptions: SignOptions =
    {
        algorithm: 'RS256',
        keyid: providerCredsFile.private_key_id,
        header: JWTHeader
    };

    const signedIdToken = jwt.sign(idToken, providerCredsFile.private_key, JWTOptions);
    const signedAccessToken = jwt.sign(accessToken, providerCredsFile.private_key, JWTOptions);

    return new TokenSet({
        access_token: signedAccessToken.toString(),
        token_type: 'Bearer',
        id_token: signedIdToken.toString(),
        refresh_token: '',
        expires_at: oneWeekFromNow,
        session_state: '',
        scope: ''
    });
}