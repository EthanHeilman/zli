import Conf from 'conf/dist/source';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { customJsonParser } from '../../../src/utils/utils';
import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { SubjectType } from '../../../webshell-common-ts/http/v2/common.types/subject.types';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { getDefaultMrtapConfig, MrtapConfigSchema } from '../../../webshell-common-ts/mrtap.service/mrtap.service.types';
import { LEGACY_KEY_STRING } from '../../services/daemon-management/daemon-management.service';
import { BastionZeroConfigSchema, ConfigInterface } from './config.service';
import { ConnectConfig, DaemonConfigs, DbConfig, getDefaultConnectConfig, getDefaultGlobalKubeConfig, getDefaultWebConfig, GlobalKubeConfig, KubeConfig, WebConfig } from './config.service.types';

export class UnixConfig implements ConfigInterface {
    public readonly path: string;
    private config: Conf<BastionZeroConfigSchema>;

    constructor(
        projectName: string,
        configName: string,
        configDir: string,
        isSystemTest: boolean,
        serviceUrl?: string,
    )
    {
        let watch = true;
        if (isSystemTest != undefined && isSystemTest == true) {
            watch = false;
        }

        this.config = new Conf<BastionZeroConfigSchema>({
            // use a custom json deserialize function to convert date strings -> date objects
            deserialize: customJsonParser,
            projectName: projectName,
            configName: configName, // prod, stage, dev or any other customly provided value
            // if unset will use system default config directory
            // a custom value is only passed for system tests
            // https://github.com/sindresorhus/conf#cwd
            cwd: configDir,
            defaults: {
                authUrl: undefined,
                clientId: undefined,
                clientSecret: undefined,
                serviceUrl: serviceUrl,
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
                    if (serviceUrl)
                        config.set('serviceUrl', serviceUrl);
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
                },
                '>=6.14.0': (config: Conf<BastionZeroConfigSchema>) => {
                    const currentSubject: SubjectSummary = config.get('whoami');
                    if(currentSubject && !currentSubject.type) {
                        currentSubject.type = SubjectType.User;
                        config.set('whoami', currentSubject);
                    }
                }
            },
            watch: watch
        });
        this.path = this.config.path;
    }

    onTokenSetChange(callback: (newValue?: TokenSetParameters, oldValue?: TokenSetParameters) => void): void {
        this.config.onDidChange('tokenSet', callback);
    }

    getWhoami(): SubjectSummary {
        return this.config.get('whoami');
    }

    getGaToken(): string {
        return this.config.get('GAToken');
    }

    getMixpanelToken(): string {
        return this.config.get('mixpanelToken');
    }

    getCallbackListenerPort(): number {
        return this.config.get('callbackListenerPort');
    }

    getServiceUrl(): string {
        return this.config.get('serviceUrl');
    }

    getAuthUrl(): string {
        return this.config.get('authUrl');
    }

    getTokenSet(): TokenSet {
        const tokenSet = this.config.get('tokenSet');
        return tokenSet && new TokenSet(tokenSet);
    }

    getIdp(): IdentityProvider{
        return this.config.get('idp');
    }

    getClientId(): string{
        return this.config.get('clientId');
    }

    getClientSecret(): string {
        return this.config.get('clientSecret');
    }

    getAuthScopes(): string {
        return this.config.get('authScopes');
    }

    getSessionId(): string {
        return this.config.get('sessionId');
    }

    getSessionToken(): string {
        return this.config.get('sessionToken');
    }

    getSshKeyPath(): string {
        return this.config.get('sshKeyPath');
    }

    getSshKnownHostsPath(): string {
        return this.config.get('sshKnownHostsPath');
    }

    getGlobalKubeConfig(): GlobalKubeConfig {
        return this.config.get('globalKubeConfig');
    }

    getWebConfig(): WebConfig {
        return this.config.get('webConfig');
    }

    getConnectConfig(): ConnectConfig {
        return this.config.get('connectConfig');
    }

    getDbDaemons(): DaemonConfigs<DbConfig> {
        return this.config.get('dbDaemons');
    }

    getKubeDaemons(): DaemonConfigs<KubeConfig> {
        return this.config.get('kubeDaemons');
    }

    getMrtap(): MrtapConfigSchema {
        return this.config.get('mrtap');
    }

    setGaToken(token: string): void {
        this.config.set('GAToken', token);
    }

    setMixpanelToken(token: string): void {
        this.config.set('mixpanelToken', token);
    }

    setSessionId(sessionId: string): void {
        this.config.set('sessionId', sessionId);
    }

    setSessionToken(sessionToken: string): void {
        this.config.set('sessionToken', sessionToken);
    }

    setAuthUrl(url: string): void {
        this.config.set('authUrl', url);
    }

    setTokenSet(tokenSet: TokenSet): void {
        this.config.set('tokenSet', tokenSet);
    }

    setIdp(idp: IdentityProvider): void {
        this.config.set('idp', idp);
    }

    setClientId(id: string): void {
        this.config.set('clientId', id);
    }

    setClientSecret(secret: string): void {
        this.config.set('clientSecret', secret);
    }

    setAuthScopes(scopes: string): void {
        this.config.set('authScopes', scopes);
    }

    setSshKeyPath(path: string): void {
        this.config.set('sshKeyPath', path);
    }

    setSshKnownHostsPath(path: string): void {
        this.config.set('sshKnownHostsPath', path);
    }

    setWhoami(me: SubjectSummary): void {
        this.config.set('whoami', me);
    }

    setWebConfig(webConfig: WebConfig): void {
        this.config.set('webConfig', webConfig);
    }

    setConnectConfig(connectConfig: ConnectConfig): void {
        this.config.set('connectConfig', connectConfig);
    }

    setGlobalKubeConfig(globalKubeConfig: GlobalKubeConfig): void {
        this.config.set('globalKubeConfig', globalKubeConfig);
    }

    setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>): void {
        this.config.set('dbDaemons', dbDaemons);
    }

    setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>): void {
        this.config.set('kubeDaemons', kubeDaemons);
    }

    setMrtap(data: MrtapConfigSchema): void {
        this.config.set('mrtap', data);
    }

    clearSshConfigPaths(): void {
        this.config.delete('sshKeyPath');
        this.config.delete('sshKnownHostsPath');
    }

    clearSessionId(): void {
        this.config.delete('sessionId');
    }

    clearSessionToken(): void {
        this.config.delete('sessionToken');
    }

    clearClientSecret(): void {
        this.config.delete('clientSecret');
    }

    clearTokenSet(): void {
        this.config.delete('tokenSet');
    }

    clearWhoami(): void {
        this.config.delete('whoami');
    }

    clearMrtap(): void {
        this.config.delete('mrtap');
    }
}