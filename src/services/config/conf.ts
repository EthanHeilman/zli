import Conf from 'conf';
import * as confType from 'conf/dist/source/types';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { customJsonParser } from 'utils/utils';
import { IdentityProvider } from 'webshell-common-ts/auth-service/auth.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { getDefaultMrtapConfig, MrtapConfigSchema } from 'webshell-common-ts/mrtap.service/mrtap.service.types';
import { ConnectConfig, DaemonConfigs, DbConfig, getDefaultConnectConfig, getDefaultGlobalKubeConfig, getDefaultTCPAppPortsConfig, getDefaultWebConfig, GlobalKubeConfig, KubeConfig, RDPConfig, SQLServerConfig, TCPAppPortsConfig, WebConfig } from 'services/config/config.service.types';

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
    tcpAppPortsConfig: TCPAppPortsConfig,
    globalKubeConfig: GlobalKubeConfig,
    dbDaemons: DaemonConfigs<DbConfig>,
    rdpDaemons: DaemonConfigs<RDPConfig>,
    sqlServerDaemons: DaemonConfigs<SQLServerConfig>,
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
                tcpAppPortsConfig: getDefaultTCPAppPortsConfig(),
                globalKubeConfig: getDefaultGlobalKubeConfig(),
                dbDaemons: {},
                rdpDaemons: {},
                sqlServerDaemons: {},
                kubeDaemons: {}
            },
            accessPropertiesByDotNotation: true,
            clearInvalidConfig: true,    // if config is invalid, delete
            migrations: migrations,
            watch: watch
        });

        this.path = this.config.path;
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

    async getTokenSet(): Promise<TokenSet> {
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

    getTcpAppPortsConfig(): TCPAppPortsConfig {
        return this.config.get('tcpAppPortsConfig');
    }

    getDbDaemons(): DaemonConfigs<DbConfig> {
        return this.config.get('dbDaemons');
    }

    getRDPDaemons(): DaemonConfigs<RDPConfig> {
        return this.config.get('rdpDaemons');
    }

    getSQLServerDaemons(): DaemonConfigs<SQLServerConfig> {
        return this.config.get('sqlServerDaemons');
    }

    getKubeDaemons(): DaemonConfigs<KubeConfig> {
        return this.config.get('kubeDaemons');
    }

    async getMrtap(): Promise<MrtapConfigSchema> {
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

    async setTokenSet(tokenSet: TokenSet): Promise<void> {
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

    setTcpAppPortsConfig(tcpAppConfig: TCPAppPortsConfig): void {
        this.config.set('tcpAppPortsConfig', tcpAppConfig);
    }

    setGlobalKubeConfig(globalKubeConfig: GlobalKubeConfig): void {
        this.config.set('globalKubeConfig', globalKubeConfig);
    }

    setDbDaemons(dbDaemons: DaemonConfigs<DbConfig>): void {
        this.config.set('dbDaemons', dbDaemons);
    }

    setRDPDaemons(rdpDaemons: DaemonConfigs<RDPConfig>): void {
        this.config.set('rdpDaemons', rdpDaemons);
    }

    setSQLServerDaemons(sqlServerDaemons: DaemonConfigs<SQLServerConfig>): void {
        this.config.set('sqlServerDaemons', sqlServerDaemons);
    }

    setKubeDaemons(kubeDaemons: DaemonConfigs<KubeConfig>): void {
        this.config.set('kubeDaemons', kubeDaemons);
    }

    async setMrtap(data: MrtapConfigSchema): Promise<void> {
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