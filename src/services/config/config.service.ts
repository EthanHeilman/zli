import { TokenSet, TokenSetParameters } from 'openid-client';
import path from 'path';
import { Observable, Subject } from 'rxjs';
import { ILogoutConfigService } from '../../handlers/logout/logout.handler';
import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { MrtapConfigInterface, MrtapConfigSchema } from '../../../webshell-common-ts/mrtap.service/mrtap.service.types';
import { TokenHttpService } from '../../http-services/token/token.http-services';
import { DbDaemonStore, KubeDaemonStore } from '../daemon-management/daemon-management.service';
import { IKubeConfigService, IKubeDaemonSecurityConfigService } from '../kube-management/kube-management.service';
import { Logger } from '../logger/logger.service';
import { ConnectConfig, DaemonConfigs, DbConfig, GlobalKubeConfig, KubeConfig, WebConfig } from './config.service.types';
import { UnixConfig } from './unix-config.service';

// refL: https://github.com/sindresorhus/conf/blob/master/test/index.test-d.ts#L5-L14
export type BastionZeroConfigSchema = {
    authUrl: string,
    clientId: string,
    clientSecret: string,
    serviceUrl: string,
    tokenSet: TokenSetParameters,
    callbackListenerPort: number,
    GAToken: string,
    MixpanelToken: string,
    idp: IdentityProvider,
    sessionId: string,
    sessionToken: string,
    whoami: SubjectSummary,
    sshKeyPath: string,
    sshKnownHostsPath: string,
    mrtap: MrtapConfigSchema,
    webConfig: WebConfig,
    connectConfig: ConnectConfig,
    globalKubeConfig: GlobalKubeConfig
    dbDaemons: DaemonConfigs<DbConfig>
    kubeDaemons: DaemonConfigs<KubeConfig>
};

export interface ConfigInterface {
    readonly path: string;

    onTokenSetChange(callback: (newValue?: TokenSetParameters, oldValue?: TokenSetParameters) => void): void;

    // "Get" functions, for retrieving values from the config
    getWhoami(): SubjectSummary;
    getGaToken(): string;
    getMixpanelToken(): string;
    getCallbackListenerPort(): number;
    getServiceUrl(): string;
    getAuthUrl(): string;
    getTokenSet(): TokenSet;
    getIdp(): IdentityProvider;
    getClientId(): string;
    getClientSecret(): string;
    getAuthScopes(): string;
    getSessionId(): string;
    getSessionToken(): string;
    getSshKeyPath(): string;
    getSshKnownHostsPath(): string;
    getGlobalKubeConfig(): GlobalKubeConfig;
    getWebConfig(): WebConfig;
    getConnectConfig(): ConnectConfig;
    getDbDaemons(): DaemonConfigs<DbConfig>;
    getKubeDaemons(): DaemonConfigs<KubeConfig>;
    getMrtap(): MrtapConfigSchema;

    // "Set" functions, for setting new values in the config
    setGaToken(token: string): void;
    setMixpanelToken(token: string): void;
    setSessionId(sessionId: string): void;
    setSessionToken(sessionToken: string): void;
    setAuthUrl(url: string): void;
    setTokenSet(tokenSet: TokenSet): void;
    setIdp(idp: IdentityProvider): void;
    setClientId(id: string): void;
    setClientSecret(secret: string): void;
    setAuthScopes(scopes: string): void;
    setSshKeyPath(path: string): void;
    setSshKnownHostsPath(path: string): void;
    setWhoami(me: SubjectSummary): void;
    setWebConfig(webConfig: WebConfig): void;
    setConnectConfig(connectConfig: ConnectConfig): void;
    setGlobalKubeConfig(globalKubeConfig: GlobalKubeConfig): void;
    setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>): void;
    setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>): void;
    setMrtap(data: MrtapConfigSchema): void;
    
    // "Clear" functions, for clearing values in the config
    clearSshConfigPaths(): void;
    clearSessionId(): void;
    clearSessionToken(): void;
    clearClientSecret(): void;
    clearTokenSet(): void;
    clearWhoami(): void;
    clearMrtap(): void;
}

export class ConfigService implements IKubeDaemonSecurityConfigService, IKubeConfigService, KubeDaemonStore, DbDaemonStore, ILogoutConfigService, MrtapConfigInterface {
    private config: ConfigInterface;
    private tokenHttpService: TokenHttpService;
    private logoutDetectedSubject: Subject<boolean> = new Subject<boolean>();

    private configName: string;
    private configPath: string;
    private serviceUrl: string;

    public logoutDetected: Observable<boolean> = this.logoutDetectedSubject.asObservable();

    constructor(configName: string, private logger: Logger, configDir?: string, isSystemTest?: boolean) {
        const projectName = 'bastionzero-zli';

        // If a custom configDir append the projectName to the path to keep
        // consistent behavior with conf so that different projectName's wont
        // overlap and use the same configuration file.
        if (configDir) {
            configDir = path.join(configDir, projectName);
        }

        this.configName = configName;

        try {
            this.serviceUrl = this.buildServiceUrl(configName);
            this.config = new UnixConfig(projectName, configName, configDir, isSystemTest, this.serviceUrl)
        } catch (e: any) {
            throw e;
        }
        
        if (configName == 'dev' && !this.config.getServiceUrl()) {
            logger.error(`Config not initialized (or is invalid) for dev environment: Must set serviceUrl in: ${this.config.path}`);
            process.exit(1);
        }

        this.tokenHttpService = new TokenHttpService(this, logger);

        this.config.onTokenSetChange((newValue: TokenSetParameters, oldValue: TokenSetParameters) => {
            // If the change in the tokenSet is a logout
            if (newValue === undefined && oldValue) {
                this.logoutDetectedSubject.next(true);
            }
        });
    }

    async loginSetup(idp: IdentityProvider, email?: string): Promise<void> {
        // Common login setup
        this.config.setIdp(idp);
        this.config.setAuthScopes(this.buildAuthScopes(idp));

        // IdP specific login setup
        switch(idp) {
        case IdentityProvider.Google:
        case IdentityProvider.Microsoft:
            const clientSecret = await this.tokenHttpService.getClientIdAndSecretForProvider(idp);
            this.config.setClientId(clientSecret.clientId);
            this.config.setClientSecret(clientSecret.clientSecret);
            this.config.setAuthUrl(this.buildCommonAuthUrl(idp));
            break;
        case IdentityProvider.Okta:
        case IdentityProvider.OneLogin:
            if (!email)
                throw new Error(`User email is required for ${idp} login`);

            const oidcClientResponse = await this.tokenHttpService.getOidcClient(email, idp);
            if (!oidcClientResponse)
                throw new Error(`Unknown organization for email: ${email}`);

            this.config.setClientId(oidcClientResponse.clientId);
            this.config.clearClientSecret;

            let domain = oidcClientResponse.domain;
            if(idp == IdentityProvider.OneLogin)
                domain = oidcClientResponse.domain.concat('/oidc/2');
            this.config.setAuthUrl(domain);
            break;
        default:
            throw new Error(`Unhandled idp ${idp} in loginSetup`);
        }

        // Clear previous login information
        this.config.clearWhoami();
    }

    logout(): void {
        this.config.clearTokenSet();
        this.config.clearMrtap();
        this.config.clearSessionId();
        this.config.clearSessionToken();
        this.config.clearSshConfigPaths();
    }

    buildAuthHeader(): string {
        const tokenSet = this.config.getTokenSet();
        return `${tokenSet.token_type} ${tokenSet.id_token}`;
    }

    private buildServiceUrl(configName: string): string {
        let appName: string;

        switch (configName) {
        case 'prod':
            appName = 'cloud';
            break;
        case 'stage':
            appName = 'cloud-staging';
            break;
        case 'dev':
            appName = 'cloud-dev';
            break;
        default:
            throw new Error(`Unrecognized config name: ${configName}`);
        }

        return `https://${appName}.bastionzero.com/`;
    }

    private buildCommonAuthUrl(idp: IdentityProvider): string {
        switch (idp) {
        case IdentityProvider.Google:
            return 'https://accounts.google.com';
        case IdentityProvider.Microsoft:
            return 'https://login.microsoftonline.com/common/v2.0';
        default:
            throw new Error(`Unable to determine auth url for unhandled idp: ${idp}`);
        }
    }

    private buildAuthScopes(idp: IdentityProvider): string {
        switch (idp) {
        case IdentityProvider.Google:
            return 'openid email profile';
        case IdentityProvider.Microsoft:
            return 'offline_access openid email profile User.Read';
        case IdentityProvider.Okta:
            return 'offline_access openid email profile';
        case IdentityProvider.OneLogin:
            return 'openid profile';
        default:
            throw new Error(`Unknown idp ${idp}`);
        }
    }

    async fetchGAToken(): Promise<void> {
        // fetch GA token from backend
        const GaToken = (await this.tokenHttpService.getGAToken())?.token;
        this.config.setGaToken(GaToken);
    }

    async fetchMixpanelToken(): Promise<void> {
        // fetch Mixpanel token from backend
        const mixpanelToken = (await this.tokenHttpService.getMixpanelToken()).token;
        this.config.setMixpanelToken(mixpanelToken);
    }

    me(): SubjectSummary {
        const whoami = this.config.getWhoami();
        if (whoami) {
            return whoami;
        } else {
            throw new Error('Subject information is missing. You need to log in, please run \'zli login --help\'');
        }
    }

    getSshKeyPath(): string {
        let keyPath = this.config.getSshKeyPath();
        if (!keyPath)
            keyPath = path.join(path.dirname(this.config.path), 'bzero-temp-key');
            this.config.setSshKeyPath(keyPath);

        return keyPath;
    }

    getSshKnownHostsPath(): string {
        let knownHostsPath = this.config.getSshKnownHostsPath();
        if (!knownHostsPath)
            knownHostsPath = path.join(path.dirname(this.config.path), 'bastionzero-known_hosts')
            this.config.setSshKnownHostsPath(knownHostsPath);

        return knownHostsPath;
    }

    getConfigName(): string {
        return this.configName;
    }

    getConfigPath(): string {
        return this.configPath;
    }

    getServiceUrl(): string {
        return this.serviceUrl;
    }

    getIdToken(): string {
        return this.config.getTokenSet().id_token;
    }

    getAccessToken(): string {
        return this.config.getTokenSet().access_token;
    }

    getGaToken(): string {
        return this.config.getGaToken();
    }

    getMixpanelToken(): string {
        return this.config.getMixpanelToken();
    }

    getCallbackListenerPort(): number {
        return this.config.getCallbackListenerPort();
    }

    getAuthUrl(): string {
        return this.config.getAuthUrl();
    }

    getTokenSet(): TokenSet {
        return this.config.getTokenSet();
    }

    getIdp(): IdentityProvider{
        return this.config.getIdp();
    }

    getClientId(): string{
        return this.config.getClientId();
    }

    getClientSecret(): string {
        return this.config.getClientSecret();
    }

    getAuthScopes(): string {
        return this.config.getAuthScopes();
    }

    getSessionId(): string {
        return this.config.getSessionId();
    }

    getSessionToken(): string {
        return this.config.getSessionToken();
    }
    
    getGlobalKubeConfig(): GlobalKubeConfig {
        return this.config.getGlobalKubeConfig();
    }

    getWebConfig(): WebConfig {
        return this.config.getWebConfig();
    }

    getConnectConfig(): ConnectConfig {
        return this.config.getConnectConfig();
    }

    getDbDaemons(): DaemonConfigs<DbConfig> {
        return this.config.getDbDaemons();
    }

    getKubeDaemons(): DaemonConfigs<KubeConfig> {
        return this.config.getKubeDaemons();
    }

    getMrtap(): MrtapConfigSchema {
        return this.config.getMrtap();
    }

    setSessionId(sessionId: string): void {
        this.config.setSessionId(sessionId);
    }

    setSessionToken(sessionToken: string): void {
        this.config.setSessionToken(sessionToken);
    }

    setMe(me: SubjectSummary): void {
        this.config.setWhoami(me);
    }

    setWebConfig(webConfig: WebConfig): void {
        this.config.setWebConfig(webConfig);
    }

    setConnectConfig(connectConfig: ConnectConfig): void {
        this.config.setConnectConfig(connectConfig);
    }

    setGlobalKubeConfig(globalKubeConfig: GlobalKubeConfig): void {
        this.config.setGlobalKubeConfig(globalKubeConfig);
    }

    setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>): void {
        this.config.setDbDaemons(dbDaemons);
    }

    setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>): void {
        this.config.setKubeDaemons(kubeDaemons);
    }

    setMrtap(data: MrtapConfigSchema): void {
        this.config.setMrtap(data);
    }
    
    setTokenSet(tokenSet: TokenSet): void {
        // TokenSet implements TokenSetParameters, makes saving it like
        // this safe to do.
        if (tokenSet)
            this.config.setTokenSet(tokenSet);
    }

    clearSessionId(): void {
        this.config.clearSessionId();
    }

    clearMrtap(): void {
        this.config.clearMrtap();
    }

    clearSshConfigPaths(): void {
        this.config.clearSshConfigPaths();
    }
}
