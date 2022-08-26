import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { OAuthService } from '../../services/oauth/oauth.service';
import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';

import jwt from 'jsonwebtoken';
import { TokenSet, TokenSetParameters } from 'openid-client';

import fs from 'fs';
import qrcode from 'qrcode';
import yargs from 'yargs';
import { loginArgs, serviceAccountLoginArgs } from './login.command-builder';
import prompts, { PromptObject } from 'prompts';
import { MfaHttpService } from '../../http-services/mfa/mfa.http-services';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { MfaActionRequired } from '../../../webshell-common-ts/http/v2/mfa/types/mfa-action-required.types';
import { UserRegisterResponse } from '../../../webshell-common-ts/http/v2/user/responses/user-register.responses';
import { removeIfExists } from '../../utils/utils';

export interface LoginResult {
    userSummary: UserSummary;
    userRegisterResponse: UserRegisterResponse;
}

function interactiveTOTPMFA(): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, _) => {
        const onCancel = () => resolve(undefined);
        const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
        await prompts({
            type: 'text',
            name: 'value',
            message: 'Enter MFA token:',
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


export async function loginServiceAccount(keySplittingService: KeySplittingService, configService: ConfigService, logger: Logger, credsPath: string): Promise<LoginResult | undefined> {    
    const SERV_ACC :boolean = true;
    
    // Clear previous log in info
    configService.logout();
    await keySplittingService.generateKeysplittingLoginData();

    // Can only create oauth service after loginSetup completes
    const oAuthService = new OAuthService(configService, logger);
    if (!oAuthService.isAuthenticated()) {
        // Create our Nonce
        const nonce = keySplittingService.createNonce();

        if ( SERV_ACC ) {
            logger.info("credsPath " + credsPath)

            var saconfig = JSON.parse(fs.readFileSync(credsPath, 'utf-8'))
            logger.info("Service Acc email " + saconfig.client_email)

        
            const twoWeeksFromNow : number = Math.floor(Date.now()/1000)*60*60*24*7*2;
            const seraccIdT = {
                aud: saconfig.client_id,
                azp: saconfig.client_id,
                email: saconfig.client_email,
                email_verified: true,
                exp: 2147483647,
                // hd: "commonwealthcrypto.com",
                hd: "bastionzero.com",
                iss: saconfig.client_email,
                nonce: nonce,
                sub: saconfig.client_id,
            };

            var jwtoptions = { 
                algorithm: 'RS256', 
                keyid: saconfig.private_key_id,
            };
                    
            var jkws_uri = "https://www.googleapis.com/service_accounts/v1/jwk/" + saconfig.client_email;

            var idT = jwt.sign(seraccIdT, saconfig.private_key, {
                algorithm: 'RS256',
                keyid: saconfig.private_key_id,
                header: {
                    alg: 'RS256',
                    kid: saconfig.private_key_id, 
                    jku: jkws_uri,
                }
               });

            const t = new TokenSet({
                access_token: idT.toString(),
                token_type: "Bearer",
                id_token: idT.toString(),
                refresh_token: "",
                expires_in: seraccIdT.exp,
                expires_at: 2147483647,
                session_state: "",
                scope: ""
            });
            configService.setTokenSet(t);
            keySplittingService.setInitialIdToken(configService.getAuth());
        } else {
            // Pass it in as we login
            await oAuthService.login((t) => {
                configService.setTokenSet(t);
                keySplittingService.setInitialIdToken(configService.getAuth());
            }, nonce);
        }
    }

    logger.info(configService.getIdToken());
    logger.info(configService.getAccessToken());
    const zcer = await keySplittingService.getBZECert(configService.getIdToken());
    logger.info("cIdT " + zcer.currentIdToken);
    logger.info("pubkey " + zcer.clientPublicKey);
    logger.info("rand " + zcer.rand);
    logger.info("signatureOnRand " + zcer.signatureOnRand);

    if ( SERV_ACC ) {

        // Register user log in and get User Session Id and Session Token
        const userHttpService = new UserHttpService(configService, logger);
        const registerResponse = await userHttpService.Register();

        const me = await userHttpService.Me();
        configService.setMe(me);

        return {
            userRegisterResponse: registerResponse,
            userSummary: me
        };

    } else {

        // Register user log in and get User Session Id and Session Token
        const userHttpService = new UserHttpService(configService, logger);
        const registerResponse = await userHttpService.Register();

        // Check if we must MFA and act upon it
        const mfaHttpService = new MfaHttpService(configService, logger);
        switch (registerResponse.mfaActionRequired) {
        case MfaActionRequired.NONE:
            break;
        case MfaActionRequired.TOTP:
            var mfaToken = "";
            if (mfaToken) {
                await mfaHttpService.VerifyMfaTotp(mfaToken);
            } else {
                logger.info('MFA token required for this account');
                const token = await interactiveTOTPMFA();
                if (token) {
                    await mfaHttpService.VerifyMfaTotp(token);
                } else {
                    return undefined;
                }
            }
            break;
        case MfaActionRequired.RESET:
            logger.info('MFA reset detected, requesting new MFA token');
            logger.info('Please scan the following QR code with your device (Google Authenticator recommended) and enter code below.');

            const resp = await mfaHttpService.ResetSecret(true);
            const data = await qrcode.toString(resp.mfaSecretUrl, { type: 'terminal', scale: 2 });
            console.log(data);

            const code = await interactiveResetMfa();
            if (code) {
                await mfaHttpService.VerifyMfaTotp(code);
            } else {
                return undefined;
            }

            break;
        default:
            logger.warn(`Unexpected MFA response ${registerResponse.mfaActionRequired}`);
            break;
        }

        const me = await userHttpService.Me();
        configService.setMe(me);

        // clear temporary SSH identity file
        removeIfExists(configService.sshKeyPath());

        return {
            userRegisterResponse: registerResponse,
            userSummary: me
        };
    }
}



export async function login(keySplittingService: KeySplittingService, configService: ConfigService, logger: Logger, mfaToken?: string): Promise<LoginResult | undefined> {
    // Clear previous log in info
    configService.logout();
    await keySplittingService.generateKeysplittingLoginData();

    // Can only create oauth service after loginSetup completes
    const oAuthService = new OAuthService(configService, logger);
    if (!oAuthService.isAuthenticated()) {
        // Create our Nonce
        const nonce = keySplittingService.createNonce();

        // Pass it in as we login
        await oAuthService.login((t) => {
            configService.setTokenSet(t);
            keySplittingService.setInitialIdToken(configService.getAuth());
        }, nonce);
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
        if (mfaToken) {
            await mfaHttpService.VerifyMfaTotp(mfaToken);
        } else {
            logger.info('MFA token required for this account');
            const token = await interactiveTOTPMFA();
            if (token) {
                await mfaHttpService.VerifyMfaTotp(token);
            } else {
                return undefined;
            }
        }
        break;
    case MfaActionRequired.RESET:
        logger.info('MFA reset detected, requesting new MFA token');
        logger.info('Please scan the following QR code with your device (Google Authenticator recommended) and enter code below.');

        const resp = await mfaHttpService.ResetSecret(true);
        const data = await qrcode.toString(resp.mfaSecretUrl, { type: 'terminal', scale: 2 });
        console.log(data);

        const code = await interactiveResetMfa();
        if (code) {
            await mfaHttpService.VerifyMfaTotp(code);
        } else {
            return undefined;
        }

        break;
    default:
        logger.warn(`Unexpected MFA response ${registerResponse.mfaActionRequired}`);
        break;
    }

    const me = await userHttpService.Me();
    configService.setMe(me);

    // clear temporary SSH files
    removeIfExists(configService.sshKeyPath());
    // removeIfExists(configService.sshKnownHostsPath());

    return {
        userRegisterResponse: registerResponse,
        userSummary: me
    };
}

export async function loginHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<loginArgs>, keySplittingService: KeySplittingService): Promise<LoginResult | undefined> {
    logger.info('Login required, opening browser');
    return login(keySplittingService, configService, logger, argv.mfa);
}

export async function loginServiceAccountHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<serviceAccountLoginArgs>, keySplittingService: KeySplittingService): Promise<LoginResult | undefined> {
    logger.info('Login required, opening browser');
    return loginServiceAccount(keySplittingService, configService, logger, argv.creds);
}