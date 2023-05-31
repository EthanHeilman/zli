import Conf from 'conf';
import * as confType from 'conf/dist/source/types';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { customJsonParser } from 'utils/utils';
import { IdentityProvider } from 'webshell-common-ts/auth-service/auth.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { getDefaultMrtapConfig, MrtapConfigSchema } from 'webshell-common-ts/mrtap.service/mrtap.service.types';
import { ConnectConfig, DaemonConfigs, DbConfig, getDefaultConnectConfig, getDefaultGlobalKubeConfig, getDefaultWebConfig, GlobalKubeConfig, KubeConfig, WebConfig } from 'services/config/config.service.types';

// refL: https://github.com/sindresorhus/conf/blob/master/test/index.test-d.ts#L5-L14
export type ConfigSchema = {
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
    globalKubeConfig: GlobalKubeConfig,
    dbDaemons: DaemonConfigs<DbConfig>,
    kubeDaemons: DaemonConfigs<KubeConfig>
};

export class Config {
    public readonly path: string;
    public config: Conf<ConfigSchema>;

    constructor(
        watch: boolean,
        projectName: string,
        configName: string,
        configDir: string,
        migrations: confType.Migrations<ConfigSchema>,
        serviceUrl: string
    ) {

        this.config = new Conf<ConfigSchema>({
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
            migrations: migrations,
            watch: watch
        });

        this.path = this.config.path;
    }

    async getWhoami(): Promise<SubjectSummary> {
        return this.config.get('whoami');
    }

    async getGaToken(): Promise<string> {
        return this.config.get('GAToken');
    }

    async getMixpanelToken(): Promise<string> {
        return this.config.get('mixpanelToken');
    }

    async getCallbackListenerPort(): Promise<number> {
        return this.config.get('callbackListenerPort');
    }

    async getServiceUrl(): Promise<string> {
        return this.config.get('serviceUrl');
    }

    async getAuthUrl(): Promise<string> {
        return this.config.get('authUrl');
    }

    async getTokenSet(): Promise<TokenSet> {
        const tokenSet = this.config.get('tokenSet');
        return tokenSet && new TokenSet(tokenSet);
    }

    async getIdp(): Promise<IdentityProvider> {
        return this.config.get('idp');
    }

    async getClientId(): Promise<string> {
        return this.config.get('clientId');
    }

    async getClientSecret(): Promise<string> {
        return this.config.get('clientSecret');
    }

    async getAuthScopes(): Promise<string> {
        return this.config.get('authScopes');
    }

    async getSessionId(): Promise<string> {
        return this.config.get('sessionId');
    }

    async getSessionToken(): Promise<string> {
        return this.config.get('sessionToken');
    }

    async getSshKeyPath(): Promise<string> {
        return this.config.get('sshKeyPath');
    }

    async getSshKnownHostsPath(): Promise<string> {
        return this.config.get('sshKnownHostsPath');
    }

    async getGlobalKubeConfig(): Promise<GlobalKubeConfig> {
        return this.config.get('globalKubeConfig');
    }

    async getWebConfig(): Promise<WebConfig> {
        return this.config.get('webConfig');
    }

    async getConnectConfig(): Promise<ConnectConfig> {
        return this.config.get('connectConfig');
    }

    async getDbDaemons(): Promise<DaemonConfigs<DbConfig>> {
        return this.config.get('dbDaemons');
    }

    async getKubeDaemons(): Promise<DaemonConfigs<KubeConfig>> {
        return this.config.get('kubeDaemons');
    }

    async getMrtap(): Promise<MrtapConfigSchema> {
        return this.config.get('mrtap');
    }

    async setGaToken(token: string): Promise<void> {
        this.config.set('GAToken', token);
    }

    async setMixpanelToken(token: string): Promise<void> {
        this.config.set('mixpanelToken', token);
    }

    async setSessionId(sessionId: string): Promise<void> {
        this.config.set('sessionId', sessionId);
    }

    async setSessionToken(sessionToken: string): Promise<void> {
        this.config.set('sessionToken', sessionToken);
    }

    async setAuthUrl(url: string): Promise<void> {
        this.config.set('authUrl', url);
    }

    async setTokenSet(tokenSet: TokenSet): Promise<void> {
        this.config.set('tokenSet', tokenSet);
    }

    async setIdp(idp: IdentityProvider): Promise<void> {
        this.config.set('idp', idp);
    }

    async setClientId(id: string): Promise<void> {
        this.config.set('clientId', id);
    }

    async setClientSecret(secret: string): Promise<void> {
        this.config.set('clientSecret', secret);
    }

    async setAuthScopes(scopes: string): Promise<void> {
        this.config.set('authScopes', scopes);
    }

    async setSshKeyPath(path: string): Promise<void> {
        this.config.set('sshKeyPath', path);
    }

    async setSshKnownHostsPath(path: string): Promise<void> {
        this.config.set('sshKnownHostsPath', path);
    }

    async setWhoami(me: SubjectSummary): Promise<void> {
        this.config.set('whoami', me);
    }

    async setWebConfig(webConfig: WebConfig): Promise<void> {
        this.config.set('webConfig', webConfig);
    }

    async setConnectConfig(connectConfig: ConnectConfig): Promise<void> {
        this.config.set('connectConfig', connectConfig);
    }

    async setGlobalKubeConfig(globalKubeConfig: GlobalKubeConfig): Promise<void> {
        this.config.set('globalKubeConfig', globalKubeConfig);
    }

    async setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>): Promise<void> {
        this.config.set('dbDaemons', dbDaemons);
    }

    async setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>): Promise<void> {
        this.config.set('kubeDaemons', kubeDaemons);
    }

    async setMrtap(data: MrtapConfigSchema): Promise<void> {
        this.config.set('mrtap', data);
    }

    async clearSshConfigPaths(): Promise<void> {
        this.config.delete('sshKeyPath');
        this.config.delete('sshKnownHostsPath');
    }

    async clearSessionId(): Promise<void> {
        this.config.delete('sessionId');
    }

    async clearSessionToken(): Promise<void> {
        this.config.delete('sessionToken');
    }

    async clearClientSecret(): Promise<void> {
        this.config.delete('clientSecret');
    }

    async clearTokenSet(): Promise<void> {
        this.config.delete('tokenSet');
    }

    async clearWhoami(): Promise<void> {
        this.config.delete('whoami');
    }

    async clearMrtap(): Promise<void> {
        this.config.delete('mrtap');
    }
}