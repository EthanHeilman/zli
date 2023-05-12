import fs from 'fs';
import path from 'path';

import { IConfig } from './config.service';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { customJsonParser } from '../../../src/utils/utils';
import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { getDefaultMrtapConfig, MrtapConfigSchema } from '../../../webshell-common-ts/mrtap.service/mrtap.service.types';
import { ConnectConfig, DaemonConfigs, DbConfig, getDefaultConnectConfig, getDefaultGlobalKubeConfig, getDefaultWebConfig, GlobalKubeConfig, KubeConfig, WebConfig } from './config.service.types';


// All keys defined for our key, value store
export const authUrlKey: string = "authUrl";
export const clientIdKey: string = "clientId";
export const clientSecretKey: string = "clientSecret";
export const serviceUrlKey: string = "serviceUrl";
export const tokenSetKey: string = "tokenSet";
export const callbackListenerPortKey: string = "callbackListenerPort";
export const gaTokenKey: string = "GAToken"; // LUCIE: we should make this camelCase to match everything else
export const mixpanelTokenKey: string = "mixpanelToken";
export const idpKey: string = "idp";
export const sessionIdKey: string = "sessionId";
export const sessionTokenKey: string = "sessionToken";
export const whoamiKey: string = "whoami";
export const sshKeyPathKey: string = "sshKeyPath";
export const sshKnownHostsPathKey: string = "sshKnownHostsPath";
export const mrtapKey: string = "mrtap";
export const webConfigKey: string = "webConfig";
export const connectConfigKey: string = "connectConfig";
export const globalKubeConfigKey: string = "globalKubeConfig";
export const dbDaemonsKey: string = "dbDaemons";
export const kubeDaemonsKey: string = "kubeDaemons";

export class Store {
    public readonly where: string;
    public readonly path: string;

    constructor(
        configName: string,
        configDir: string // might be empty?
    ) {
        // Define where our db will be stored
        this.where = path.join(configDir, configName, 'store');
        this.path = this.where;

        // Make sure the path exists, and make it if it doesn't
        fs.existsSync(this.where) || fs.mkdirSync(this.where, { recursive: true });
    }

    // async init(serviceUrl: string) {
    //     try {
    //         // Because no callback is provided in levelup(), any read & write operations are simply queued internally 
    //         // until the store is fully opened, unless it fails to open, in which case an error event will be emitted.
    //         this.store = levelup(leveldown(this.where));

    //         await this.store.put(serviceUrlKey, serviceUrl);

    //         // We always close the store to free up resources since no two instances of levelup can be open at once
    //         await this.store.close();
    //     } catch (e) {
    //         throw new Error(`Failed to open up the store: ${e}`);
    //     }
    // }

    // async getWhoami(): Promise<SubjectSummary> {
    //     let whoami: SubjectSummary;

    //     await this.store.open();
    //     try {
    //         const value = await this.store.get(whoamiKey);
    //         whoami = JSON.parse(value);
    //     } catch (e) {} // key doesn't exist

    //     await this.store.close();
    //     return whoami;

    //     // let whoami: SubjectSummary;

    //     // await this.store.get(whoamiKey, function(err, value) {
    //     //     if (!err) {
    //     //         whoami = JSON.parse(value);
    //     //     }
    //     // });
    //     // await this.store.close();

    //     // return whoami;
    // }

    // async getGaToken(): Promise<string> {
    //     let gaToken: string;

    //     await this.store.open();
    //     try {
    //         const gaToken = await this.store.get(whoamiKey);
    //     } catch (e) {} // key doesn't exist

    //     await this.store.close();
    //     return gaToken;
    // }

}