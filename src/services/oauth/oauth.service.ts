import { AuthorizationParameters, Client, ClientMetadata, custom, errors, generators, Issuer, TokenSet } from 'openid-client';
import path from 'path';
import open from 'open';
import lockfile from 'proper-lockfile';
import { IDisposable } from 'webshell-common-ts/utility/disposable';
import { IdentityProvider } from 'webshell-common-ts/auth-service/auth.types';
import { ConfigService } from 'services/config/config.service';
import http, { RequestListener } from 'http';
import { setTimeout } from 'timers';
import { Logger } from 'services/logger/logger.service';
import { loginHtml } from 'services/oauth/templates/login';
import { logoutHtml } from 'services/oauth/templates/logout';
import { cleanExit } from 'handlers/clean-exit.handler';
import { parse as QueryStringParse } from 'query-string';
import { parseIdpType, randomAlphaNumericString } from 'utils/utils';
import { check as checkTcpPort } from 'tcp-port-used';
import { RefreshTokenError, UserNotLoggedInError } from 'services/oauth/oauth.service.types';
import { UserHttpService } from 'http-services/user/user.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';

// Do not remove any of these, clients have integrations set up based on these!
const callbackPorts: number[] = [49172, 51252, 58243, 59360, 62109];

// Global timeout used for all http requests inside openid-client library
// including discovery and token requests.We could use more specific timeouts on
// a per-request basis in the future if we need to
// https://github.com/panva/node-openid-client/blob/main/docs/README.md#customizing-individual-http-requests
const OAUTH_GLOBAL_HTTP_TIMEOUT = 10 * 1000;
custom.setHttpOptionsDefaults({
    timeout: custom.setHttpOptionsDefaults({
        timeout: OAUTH_GLOBAL_HTTP_TIMEOUT,
    })
});

export class OAuthService implements IDisposable {
    private server: http.Server; // callback listener
    private host: string = 'localhost';
    private logger: Logger;
    private oidcClient: Client;
    private codeVerifier: string;
    private nonce: string;
    private state: string;

    constructor(private configService: ConfigService, logger: Logger) {
        this.logger = logger;
    }

    private setupCallbackListener(
        callbackPort: number,
        callback: (tokenSet: TokenSet) => Promise<void>,
        onListen: () => void,
        resolve: (value?: void | PromiseLike<void>) => void,
        reject: (reason?: any) => void
    ): void {

        const requestListener: RequestListener = async (req, res) => {
            // Example of request url string
            // /login-callback?param=...
            const urlParts = req.url.split('?');
            const queryParams = QueryStringParse(urlParts[1]);

            // example of failed login attempt
            // http://localhost:3000/login-callback?error=consent_required&error_description=AADSTS65004%3a+User+decline...
            if(!! queryParams.error)
            {
                reject(queryParams.error);
            }

            switch (urlParts[0]) {
            case '/webapp-callback':
                // Prepare config for a new login
                const provider = parseIdpType(queryParams.idp as IdentityProvider);
                const email = queryParams.email as string;

                if(provider === undefined) {
                    reject('The selected identity provider is not currently supported');
                }

                try {
                    await this.configService.loginSetup(provider, email);

                    // Setup the oidc client for a new login
                    await this.setupClient(callbackPort);
                    this.codeVerifier = generators.codeVerifier();

                    // While state is not strictly required to be set per the
                    // oidc spec when using PKCE flow, it is specifically
                    // required by okta and onelogin and will fail if left empty.
                    // So we implement sending a random value in the state for all providers
                    // https://github.com/panva/node-openid-client/issues/377
                    // https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/#flow-specifics
                    this.state = randomAlphaNumericString(45);
                    const code_challenge = generators.codeChallenge(this.codeVerifier);

                    // Redirect to the idp
                    res.writeHead(302, {
                        'Access-Control-Allow-Origin': '*',
                        'content-type': 'text/html',
                        'Location': this.getAuthUrl(code_challenge, email, this.state)
                    });
                    res.end();
                } catch(err) {
                    reject(`Error occurred when trying to login with ${provider}. ${err.message}`);
                }

                break;

            case '/login-callback':
                if(this.oidcClient === undefined){
                    reject('Unable to parse idp response with undefined OIDC client');
                }

                if(this.codeVerifier === undefined){
                    reject('Unable to parse idp response with undefined code verifier');
                }

                if(this.nonce === undefined){
                    reject('Unable to parse idp response with undefined nonce');
                }

                const params = this.oidcClient.callbackParams(req);

                const tokenSet = await this.oidcClient.callback(
                    `http://${this.host}:${callbackPort}/login-callback`,
                    params,
                    { code_verifier: this.codeVerifier, nonce: this.nonce, state: this.state });

                this.logger.debug('callback listener closed');

                // write to config with callback
                try {
                    await callback(tokenSet);
                } catch (e) {
                    reject(e);
                }

                this.server.close();
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'content-type': 'text/html'
                });

                this.logger.info('Login successful');
                res.write(loginHtml);
                res.end();
                resolve();
                break;

            case '/logout-callback':
                this.logger.info('Logout successful');
                this.logger.debug('callback listener closed');
                this.server.close();
                res.write(logoutHtml);
                resolve();
                break;

            default:
                this.logger.debug(`Unhandled callback at: ${req.url}`);
                break;
            }
        };

        this.logger.debug(`Setting up callback listener at http://${this.host}:${callbackPort}/`);
        this.server = http.createServer(requestListener);
        // Port binding failure will produce error event
        this.server.on('error', async (err) => {
            this.logger.error(`Error occurred in spawning callback server: ${err}`);
            await cleanExit(1, this.logger);
        });
        // open browser after successful port binding
        this.server.on('listening', onListen);
        this.server.listen(callbackPort, this.host, () => { });
    }

    private async setupClient(callbackPort? : number): Promise<void>
    {
        const authority = await Issuer.discover(this.configService.getAuthUrl());

        const clientMetadata : ClientMetadata = {
            client_id: this.configService.getClientId(),
            response_types: ['code'],
        };

        // Client secret is not used for Okta, OneLogin and Keycloak but it is required for Google/Microsoft
        // https://github.com/panva/node-openid-client/blob/main/docs/README.md#client-authentication-methods
        const clientSecret = this.configService.getClientSecret();
        if(clientSecret) {
            clientMetadata.client_secret = clientSecret;
            clientMetadata.token_endpoint_auth_method =  'client_secret_basic';
        } else {
            clientMetadata.token_endpoint_auth_method = 'none';
        }

        if (callbackPort) {
            clientMetadata.redirect_uris = [`http://${this.host}:${callbackPort}/login-callback`];
        }
        const client = new authority.Client(clientMetadata);

        // set clock skew
        // ref: https://github.com/panva/node-openid-client/blob/77d7c30495df2df06c407741500b51498ba61a94/docs/README.md#customizing-clock-skew-tolerance
        client[custom.clock_tolerance] = 5 * 60; // 5 minute clock skew allowed for verification

        this.oidcClient = client;
    }

    private getAuthUrl(code_challenge: string, email: string, state: string) : string
    {
        if(this.oidcClient === undefined){
            throw new Error('Unable to get authUrl from undefined OIDC client');
        }

        if(this.nonce === undefined){
            throw new Error('Unable to get authUrl with undefined nonce');
        }

        const idp = this.configService.getIdp();
        if(idp === undefined){
            throw new Error('Unable to get authUrl from undefined idp');
        }

        let prompt = '';
        switch (idp) {
        case IdentityProvider.Google:
        case IdentityProvider.Okta:
            prompt = 'consent';
            break;
        case IdentityProvider.Microsoft:
        case IdentityProvider.OneLogin:
        case IdentityProvider.Keycloak:
            prompt = 'login';
            break;
        default:
            throw new Error(`Unsupported IdP: ${idp}`);
        }

        const authParams: AuthorizationParameters = {
            client_id: this.configService.getClientId(), // This one gets put in the queryParams
            response_type: 'code',
            code_challenge: code_challenge,
            code_challenge_method: 'S256',
            scope: this.configService.getAuthScopes(),
            // required for google refresh token
            prompt: prompt,
            access_type: 'offline',
            nonce: this.nonce,
            state: state
        };

        if(idp == IdentityProvider.Okta || idp == IdentityProvider.OneLogin || idp == IdentityProvider.Keycloak) {
            authParams.login_hint = email;
        }

        return this.oidcClient.authorizationUrl(authParams);
    }

    public async isAuthenticated(): Promise<boolean>
    {
        const tokenSet = await this.configService.getTokenSet();

        if(tokenSet === undefined)
            return false;

        return !tokenSet.expired() && !this.isIdTokenExpired(tokenSet);
    }

    private isIdTokenExpired(tokenSet: TokenSet): boolean
    {
        const nowUnixEpochTime = Math.floor(Date.now() / 1000);
        const bufferMinutes = 5;
        return nowUnixEpochTime + 60 * bufferMinutes >= tokenSet.claims().exp;
    }

    public async login(callback: (tokenSet: TokenSet) => Promise<void>, nonce?: string): Promise<void> {
        const portToCheck = this.configService.getCallbackListenerPort();
        let portToUse : number = undefined;
        // If no port has been set by user
        if (portToCheck == 0) {
            // Find open port
            for (const port of callbackPorts) {
                if (! await checkTcpPort(port, this.host)) {
                    portToUse = port;
                    break;
                }
            }

            if ( portToUse === undefined){
                this.logger.error(`Log in listener could not bind to any of the default ports ${callbackPorts}`);
                this.logger.warn(`Please make sure either of ports ${callbackPorts} is open/whitelisted`);
                this.logger.warn('To set a custom callback port please run: \'zli configure\' and change \'callbackListenerPort\' in your config file');
                await cleanExit(1, this.logger);
            }

        } else {
            // User supplied custom port in configuration
            // Check to see if the port is in use and fail early if we
            // cannot bind
            const isPortInUse = await checkTcpPort(portToCheck, this.host);
            if (isPortInUse) {
                this.logger.error(`Log in listener could not bind to port ${portToCheck}`);
                this.logger.warn(`Please make sure port ${portToCheck} is open/whitelisted`);
                this.logger.warn('To edit callback port please run: \'zli configure\' and change \'callbackListenerPort\' in your config file');
                await cleanExit(1, this.logger);
            } else {
                portToUse = portToCheck;
            }
        }

        this.nonce = nonce;
        return new Promise<void>(async (resolve, reject) => {
            setTimeout(() => reject('Login timeout reached'), 60 * 1000);

            const openBrowser = async () => await open(`${this.configService.getServiceUrl()}authentication/login?zliLogin=true&port=${portToUse}`);

            await this.setupCallbackListener(portToUse, callback, openBrowser, resolve, reject);
        });
    }

    public async refresh(): Promise<TokenSet>
    {
        await this.setupClient();
        const tokenSet = await this.configService.getTokenSet();
        const refreshToken = tokenSet.refresh_token;
        const refreshedTokenSet = await this.oidcClient.refresh(tokenSet);

        // In case of google the refreshed token is not returned in the refresh
        // response so we set it from the previous value
        if(! refreshedTokenSet.refresh_token)
            refreshedTokenSet.refresh_token = refreshToken;

        return refreshedTokenSet;
    }

    /**
     * Get the current user's Token Set. Refresh it if it has expired.
     * @returns The current user's Token Set
     */
    public async getTokenSet(): Promise<TokenSet> {
        let tokenSet = await this.configService.getTokenSet();
        if (!tokenSet) {
            throw new UserNotLoggedInError();
        }

        if (await this.isAuthenticated()) {
            return tokenSet;
        }

        // Service accounts do not have the ability to automatically refresh
        if(this.configService.me().type === SubjectType.ServiceAccount){
            throw new Error('Service account session has expired, please log in again.');
        }

        const configDir = path.dirname(this.configService.getConfigPath());
        const lockName = path.join(configDir, 'getTokenSet');

        let release: () => Promise<void>;
        try {
            release = await lockfile.lock(lockName, {
                realpath: false,
                stale: 5000, // 5 seconds
                retries: {
                    retries: 20,
                    minTimeout: 300, // The number of milliseconds before starting the first retry
                    maxTimeout: 500, // The maximum number of milliseconds between two retries
                    maxRetryTime: 5 * 5000 // The maximum time (in milliseconds) that the retried operation is allowed to run
                }
            });
        } catch (e) {
            // Either lock could not be acquired or releasing it failed
            this.logger.debug(`Failed to acquire ${lockName} lock: ${e}`);
            this.logger.error(`Runtime error. Please try executing the command again.`);
            cleanExit(1, this.logger);
        }

        // Check if another process refreshed the tokens while we were waiting
        if (await this.isAuthenticated()) {
            tokenSet = await this.configService.getTokenSet();
        } else {
            this.logger.debug('Refreshing OAuth tokens');
            try {
                tokenSet = await this.refresh();
            } catch (e) {
                release();

                this.logger.debug(`Failed to refresh OAuth tokens. ${e.message}`);
                if (e instanceof errors.RPError || e instanceof errors.OPError) {
                    throw new RefreshTokenError();
                } else {
                    throw e;
                }
            }

            this.configService.setTokenSet(tokenSet);
            this.logger.debug('OAuth tokens refreshed');

            const userHttpService = new UserHttpService(this.configService, this.logger);
            await userHttpService.Register();

            // Update me section of the config in case this is a new login or any
            // user information has changed since last login
            const subjectHttpService = new SubjectHttpService(this.configService, this.logger);
            const me = await subjectHttpService.Me();
            this.configService.setMe(me);
        }

        release();
        return tokenSet;
    }

    /**
     * Get the current user's id_token. Refresh it if it has expired. This
     * function will exit the running process if any error occurs or if the user
     * is not logged in (i.e. tokenSet not found in config).
     * @returns The current OIDC id_token
     */
    public async getIdTokenAndExitOnError(): Promise<string> {
        let idToken: string;
        try {
            const tokenSet = await this.getTokenSet();
            idToken = tokenSet.id_token;

            // If the OIDC tokens are not expired but there is no sessionId/Token
            // or the registration did not create/update properly a new set of sessionId/Token
            if (!this.configService.getSessionId() || !this.configService.getSessionToken()) {
                throw new UserNotLoggedInError();
            }
        } catch (e) {
            this.logger.debug(`Get id token error: ${e.message}`);
            if (e instanceof RefreshTokenError) {
                this.logger.error('Stale log in detected');
                this.configService.logout();
            } else if (e instanceof UserNotLoggedInError) {
            } else {
                this.configService.logout();
            }

            this.logger.info('You need to log in, please run \'zli login --help\'');
            await cleanExit(1, this.logger);
        }

        return idToken;
    }

    dispose(): void {
        if(this.server)
        {
            this.server.close();
            this.server = undefined;
        }
    }
}