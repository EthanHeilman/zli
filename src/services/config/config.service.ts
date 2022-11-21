import Conf from 'conf/dist/source';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { Logger } from '../logger/logger.service';
import { MrtapConfigSchema, ConfigInterface, getDefaultMrtapConfig } from '../../../webshell-common-ts/mrtap.service/mrtap.service.types';
import path from 'path';
import { Observable, Subject } from 'rxjs';
import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { TokenHttpService } from '../../http-services/token/token.http-services';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { DaemonConfigs, DbConfig, getDefaultWebConfig, getDefaultConnectConfig, KubeConfig, WebConfig, ConnectConfig, GlobalKubeConfig, getDefaultGlobalKubeConfig } from './config.service.types';
import { LEGACY_KEY_STRING } from '../../services/daemon-management/daemon-management.service';

// refL: https://github.com/sindresorhus/conf/blob/master/test/index.test-d.ts#L5-L14
type BastionZeroConfigSchema = {
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
    whoami: UserSummary,
    sshKeyPath: string,
    sshKnownHostsPath: string,
    mrtap: MrtapConfigSchema,
    webConfig: WebConfig,
    connectConfig: ConnectConfig,
    globalKubeConfig: GlobalKubeConfig
    dbDaemons: DaemonConfigs<DbConfig>
    kubeDaemons: DaemonConfigs<KubeConfig>
};

export class ConfigService implements ConfigInterface {
    private config: Conf<BastionZeroConfigSchema>;
    private configName: string;
    private tokenHttpService: TokenHttpService;
    private logoutDetectedSubject: Subject<boolean> = new Subject<boolean>();

    public logoutDetected: Observable<boolean> = this.logoutDetectedSubject.asObservable();

    constructor(configName: string, private logger: Logger, configDir?: string, isSystemTest?: boolean) {
        const projectName = 'bastionzero-zli';

        // If a custom configDir append the projectName to the path to keep
        // consistent behavior with conf so that different projectName's wont
        // overlap and use the same configuration file.
        if (configDir) {
            configDir = path.join(configDir, projectName);
        }

        let watch = true;
        if (isSystemTest != undefined && isSystemTest == true) {
            watch = false;
        }

        const appName = this.getAppName(configName);
        this.configName = configName;
        this.config = new Conf<BastionZeroConfigSchema>({
            projectName: projectName,
            configName: configName, // prod, stage, dev,
            // if unset will use system default config directory
            // a custom value is only passed for system tests
            // https://github.com/sindresorhus/conf#cwd
            cwd: configDir,
            defaults: {
                authUrl: undefined,
                clientId: undefined,
                clientSecret: undefined,
                serviceUrl: appName ? this.getServiceUrl(appName) : undefined,
                tokenSet: undefined, // tokenSet.expires_in is Seconds
                callbackListenerPort: 0, // if the port is 0, the oauth.service will ask the OS for available port
                GAToken: undefined,
                MixpanelToken: undefined,
                idp: undefined,
                sessionId: undefined,
                sessionToken: undefined,
                whoami: undefined,
                sshKeyPath: undefined,
                sshKnownHostsPath: undefined,
                mrtap: getDefaultMrtapConfig(),
                webConfig: getDefaultWebConfig(),
                connectConfig: getDefaultConnectConfig(),
                globalKubeConfig: getDefaultGlobalKubeConfig(),
                dbDaemons: {},
                kubeDaemons: {}
            },
            accessPropertiesByDotNotation: true,
            clearInvalidConfig: true,    // if config is invalid, delete
            migrations: {
                // migrate old configs to have new serviceUrl
                '>4.3.0': (config: Conf<BastionZeroConfigSchema>) => {
                    if (appName)
                        config.set('serviceUrl', this.getServiceUrl(appName));
                },
                // migrate old dbConfig to new dbDaemons format + discriminant property
                // migrate kubeConfig and webConfig to use discriminant property
                '>=6.8.0': (config: Conf<BastionZeroConfigSchema>) => {
                    const legacyDbConfig: DbConfig = config.get('dbConfig', undefined);
                    const kubeConfig: KubeConfig = config.get('kubeConfig', undefined);
                    const webConfig: WebConfig = config.get('webConfig', undefined);

                    // Important! Legacy configs did not set discriminant
                    // property (`type`). We must set it now that DaemonConfig
                    // contains a type field which some caller might
                    // discriminate on.
                    if (legacyDbConfig) {
                        legacyDbConfig.type = 'db';

                        // Add legacy db config to new schema which is a
                        // dictionary keyed by connectionId. In the future,
                        // multi-web and multi-kube can do a similar migration
                        // to init their respective daemons dictionary.

                        const initDbDaemons: DaemonConfigs<DbConfig> = {};
                        // Use special LEGACY_KEY_STRING as a key, so that
                        // DaemonManagementService() can interpret this config
                        // as a legacy config with no connection ID
                        initDbDaemons[LEGACY_KEY_STRING] = legacyDbConfig;
                        config.set('dbDaemons', initDbDaemons);

                        // Delete the old db config value as it's no longer used
                        // in connect handler. We have to use "as any" because
                        // the schema type no longer includes it.
                        config.delete('dbConfig' as any);
                    }

                    // Set the kubeConfig and webConfig values to ensure the
                    // discriminant property is saved.
                    if (kubeConfig) {
                        kubeConfig.type = 'kube';
                        config.set('kubeConfig', kubeConfig);
                    }
                    if (webConfig) {
                        webConfig.type = 'web';
                        config.set('webConfig', webConfig);
                    }
                },
                // rename keysplitting -> MrTAP
                '>=6.12.0': (config: Conf<BastionZeroConfigSchema>) => {
                    const ksConfig: MrtapConfigSchema = config.get('keySplitting', getDefaultMrtapConfig());
                    config.set('mrtap', ksConfig);
                    config.delete('keySplitting' as any);
                },
                // Migrate old kubeConfig to new kubeDaemons map + global kube
                // settings
                '>=6.13.0': (config: Conf<BastionZeroConfigSchema>) => {
                    const legacyKubeConfig: any = config.get('kubeConfig', undefined);

                    // Move over global fields that used to exist in legacy kube
                    // config schema to new schema
                    if (legacyKubeConfig) {
                        // If all security related things are truthy, then
                        // migrate them
                        if (legacyKubeConfig.keyPath &&
                            legacyKubeConfig.certPath &&
                            legacyKubeConfig.csrPath &&
                            legacyKubeConfig.token
                        ) {
                            const globalKubeConfig: GlobalKubeConfig = {
                                securitySettings:
                                {
                                    keyPath: legacyKubeConfig.keyPath,
                                    certPath: legacyKubeConfig.certPath,
                                    csrPath: legacyKubeConfig.csrPath,
                                    token: legacyKubeConfig.token,
                                },
                                defaultTargetGroups: legacyKubeConfig.defaultTargetGroups ? legacyKubeConfig.defaultTargetGroups : null,
                            };
                            config.set('globalKubeConfig', globalKubeConfig);
                        } else {
                            // Otherwise, if at least one security related field
                            // is not truthy, then set to null. It will be
                            // generated on the fly when needed again
                            const globalKubeConfig: GlobalKubeConfig = {
                                securitySettings: null,
                                defaultTargetGroups: legacyKubeConfig.defaultTargetGroups ? legacyKubeConfig.defaultTargetGroups : null,
                            };
                            config.set('globalKubeConfig', globalKubeConfig);
                        }

                        // Migrate existing kube daemon to new kubeDaemonsMap

                        // Add legacy db config to new schema which is a
                        // dictionary keyed by connectionId.
                        const initKubeDaemons: DaemonConfigs<KubeConfig> = {};

                        // Only add legacy kube config to new map if it has
                        // truthy fields
                        if (legacyKubeConfig.localHost &&
                            legacyKubeConfig.localPort &&
                            legacyKubeConfig.localPid &&
                            legacyKubeConfig.targetUser &&
                            legacyKubeConfig.targetGroups &&
                            legacyKubeConfig.targetCluster
                        ) {
                            // Use special LEGACY_KEY_STRING as a key, so that
                            // DaemonManagementService() can interpret this
                            // config as a legacy config with no connection ID
                            initKubeDaemons[LEGACY_KEY_STRING] = legacyKubeConfig;
                        }

                        config.set('kubeDaemons', initKubeDaemons);

                        // Delete old schema as we've migrated
                        config.delete('kubeConfig' as any);
                    }
                }
            },
            watch: watch
        });

        if (configName == 'dev' && !this.config.get('serviceUrl')) {
            logger.error(`Config not initialized (or is invalid) for dev environment: Must set serviceUrl in: ${this.config.path}`);
            process.exit(1);
        }

        this.tokenHttpService = new TokenHttpService(this, logger);

        this.config.onDidChange('tokenSet',
            (newValue: TokenSetParameters, oldValue: TokenSetParameters) => {
                // If the change in the tokenSet is a logout
                if (newValue === undefined && oldValue) {
                    this.logoutDetectedSubject.next(true);
                }
            });
    }

    public updateMrtap(data: MrtapConfigSchema): void {
        this.config.set('mrtap', data);
    }

    public loadMrtap(): MrtapConfigSchema {
        return this.config.get('mrtap');
    }

    public removeMrtap(): void {
        this.config.delete('mrtap');
    }

    public getConfigName() {
        return this.configName;
    }

    public configPath(): string {
        return this.config.path;
    }

    public GAToken(): string {
        return this.config.get('GAToken');
    }

    public mixpanelToken(): string {
        return this.config.get('mixpanelToken');
    }

    public callbackListenerPort(): number {
        return this.config.get('callbackListenerPort');
    }

    public serviceUrl(): string {
        return this.config.get('serviceUrl');
    }

    public authUrl(): string {
        return this.config.get('authUrl');
    }

    public tokenSet(): TokenSet {
        const tokenSet = this.config.get('tokenSet');
        return tokenSet && new TokenSet(tokenSet);
    }

    public idp(): IdentityProvider {
        return this.config.get('idp');
    }

    public clientId(): string {
        return this.config.get('clientId');
    }

    public clientSecret(): string {
        return this.config.get('clientSecret');
    }

    public authScopes(): string {
        return this.config.get('authScopes');
    }

    public getAuthHeader(): string {
        return `${this.tokenSet().token_type} ${this.tokenSet().id_token}`;
    }

    public getIdToken(): string {
        return this.tokenSet().id_token;
    }

    public getAccessToken(): string {
        return this.tokenSet().access_token;
    }

    public getAuth(): string {
        return this.tokenSet().id_token;
    }

    public getSessionId(): string {
        return this.config.get('sessionId');
    }

    public getSessionToken(): string {
        return this.config.get('sessionToken');
    }

    public setSessionId(sessionId: string): void {
        this.config.set('sessionId', sessionId);
    }

    public setSessionToken(sessionToken: string): void {
        this.config.set('sessionToken', sessionToken);
    }

    public setTokenSet(tokenSet: TokenSet): void {
        // TokenSet implements TokenSetParameters, makes saving it like
        // this safe to do.
        if (tokenSet)
            this.config.set('tokenSet', tokenSet);
    }

    public me(): UserSummary {
        const whoami = this.config.get('whoami');
        if (whoami) {
            return whoami;
        } else {
            throw new Error('User information is missing. You need to log in, please run \'zli login --help\'');
        }
    }

    public setMe(me: UserSummary): void {
        this.config.set('whoami', me);
    }

    public sshKeyPath(): string {
        if (!this.config.get('sshKeyPath'))
            this.config.set('sshKeyPath', path.join(path.dirname(this.config.path), 'bzero-temp-key'));

        return this.config.get('sshKeyPath');
    }

    public sshKnownHostsPath(): string {
        if (!this.config.get('sshKnownHostsPath'))
            this.config.set('sshKnownHostsPath', path.join(path.dirname(this.config.path), 'bastionzero-known_hosts'));

        return this.config.get('sshKnownHostsPath');
    }

    public clearSshConfigPaths() {
        this.config.delete('sshKeyPath');
        this.config.delete('sshKnownHostsPath');
    }

    public logout(): void {
        this.config.delete('tokenSet');
        this.config.delete('mrtap');
        this.config.delete('sessionToken');
    }

    public async fetchGAToken() {
        // fetch GA token from backend
        const GAToken = await this.getGAToken();
        this.config.set('GAToken', GAToken);
    }

    public deleteSessionId(): void {
        this.config.delete('sessionId');
    }

    public async fetchMixpanelToken() {
        // fetch Mixpanel token from backend
        const mixpanelToken = await this.getMixpanelToken();
        this.config.set('mixpanelToken', mixpanelToken);
    }

    public async loginSetup(idp: IdentityProvider, email?: string): Promise<void> {
        // Common login setup
        this.config.set('idp', idp);
        this.config.set('authScopes', this.getAuthScopes(idp));

        // IdP specific login setup
        if (idp == IdentityProvider.Google || idp == IdentityProvider.Microsoft) {
            const clientSecret = await this.tokenHttpService.getClientIdAndSecretForProvider(idp);
            this.config.set('clientId', clientSecret.clientId);
            this.config.set('clientSecret', clientSecret.clientSecret);
            this.config.set('authUrl', this.getCommonAuthUrl(idp));
        } else if (idp == IdentityProvider.Okta) {
            if (!email)
                throw new Error('User email is required for logging in with okta');

            const oktaClientResponse = await this.tokenHttpService.getOktaClient(email);
            if (!oktaClientResponse)
                throw new Error(`Unknown organization for email ${email}`);

            this.config.set('clientId', oktaClientResponse.clientId);
            this.config.delete('clientSecret');
            this.config.set('authUrl', `${oktaClientResponse.domain}`);
        } else {
            throw new Error(`Unhandled idp ${idp} in loginSetup`);
        }

        // Clear previous login information
        this.config.delete('whoami');
    }

    public getGlobalKubeConfig() {
        return this.config.get('globalKubeConfig');
    }

    public getWebConfig() {
        return this.config.get('webConfig');
    }

    public getConnectConfig() {
        return this.config.get('connectConfig');
    }

    public getBastionUrl() {
        return this.config.get('serviceUrl');
    }

    public setWebConfig(webConfig: WebConfig) {
        this.config.set('webConfig', webConfig);
    }

    public setConnectConfig(connectConfig: ConnectConfig) {
        this.config.set('connectConfig', connectConfig);
    }

    public setGlobalKubeConfig(globalKubeConfig: GlobalKubeConfig) {
        this.config.set('globalKubeConfig', globalKubeConfig);
    }

    public setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>) {
        this.config.set('dbDaemons', dbDaemons);
    }

    public getDbDaemons(): DaemonConfigs<DbConfig> {
        return this.config.get('dbDaemons');
    }

    public setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>) {
        this.config.set('kubeDaemons', kubeDaemons);
    }

    public getKubeDaemons(): DaemonConfigs<KubeConfig> {
        return this.config.get('kubeDaemons');
    }

    private getAppName(configName: string) {
        switch (configName) {
        case 'prod':
            return 'cloud';
        case 'stage':
            return 'cloud-staging';
        case 'dev':
            return 'cloud-dev';
        default:
            return undefined;
        }
    }

    private getServiceUrl(appName: string) {

        return `https://${appName}.bastionzero.com/`;
    }

    private getCommonAuthUrl(idp: IdentityProvider) {
        switch (idp) {
        case IdentityProvider.Google:
            return 'https://accounts.google.com';
        case IdentityProvider.Microsoft:
            return 'https://login.microsoftonline.com/common/v2.0';
        default:
            throw new Error(`Unhandled idp ${idp} in getCommonAuthUrl`);
        }
    }

    private getAuthScopes(idp: IdentityProvider) {
        switch (idp) {
        case IdentityProvider.Google:
            return 'openid email profile';
        case IdentityProvider.Microsoft:
            return 'offline_access openid email profile User.Read';
        case IdentityProvider.Okta:
            return 'offline_access openid email profile';
        default:
            throw new Error(`Unknown idp ${idp}`);
        }
    }

    private async getGAToken(): Promise<string> {
        return (await this.tokenHttpService.getGAToken())?.token;
    }

    private async getMixpanelToken(): Promise<string> {
        return (await this.tokenHttpService.getMixpanelToken()).token;
    }
}
