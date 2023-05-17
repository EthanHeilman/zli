import Conf from 'conf/dist/source';
import path from 'path';
import { TokenSetParameters } from 'openid-client';
import { Subject } from 'rxjs';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { getDefaultMrtapConfig, MrtapConfigSchema } from 'webshell-common-ts/mrtap.service/mrtap.service.types';
import { LEGACY_KEY_STRING } from 'services/daemon-management/daemon-management.service';
import { Config, ConfigSchema } from 'services/config/conf';
import { IConfig } from 'services/config/config.service';
import { DaemonConfigs, DbConfig, GlobalKubeConfig, KubeConfig, WebConfig } from 'services/config/config.service.types';
import { TokenSet } from 'openid-client';
import fs from 'fs';
import { ClassicLevel } from 'classic-level';
import { mrtapKey, tokenSetKey, whoamiKey } from './leveldb';

export class UnixConfig extends Config implements IConfig  {
    private levelDBPath: string;

    constructor(
        projectName: string,
        configName: string,
        configDir: string,
        isSystemTest: boolean,
        logoutDetectedSubject: Subject<boolean>,
        serviceUrl?: string,
    ) {
        let watch = true;
        if (isSystemTest != undefined && isSystemTest == true) {
            watch = false;
        }

        const migrations = {
            // migrate old configs to have new serviceUrl
            '>4.3.0': (config: Conf<ConfigSchema>) => {
                if (serviceUrl)
                    config.set('serviceUrl', serviceUrl);
            },
            // migrate old dbConfig to new dbDaemons format + discriminant property
            // migrate kubeConfig and webConfig to use discriminant property
            '>=6.8.0': (config: Conf<ConfigSchema>) => {
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
            '>=6.12.0': (config: Conf<ConfigSchema>) => {
                const ksConfig: MrtapConfigSchema = config.get('keySplitting', getDefaultMrtapConfig());
                config.set('mrtap', ksConfig);
                config.delete('keySplitting' as any);
            },
            // Migrate old kubeConfig to new kubeDaemons map + global kube
            // settings
            '>=6.13.0': (config: Conf<ConfigSchema>) => {
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
            '>=6.14.0': (config: Conf<ConfigSchema>) => {
                const currentSubject: SubjectSummary = config.get('whoami');
                if(currentSubject && !currentSubject.type) {
                    currentSubject.type = SubjectType.User;
                    config.set('whoami', currentSubject);
                }
            }
        };

        super(watch, projectName, configName, configDir, migrations, serviceUrl);

        // for testing leveldb
        const p = `/Users/moleperson/Library/Preferences/bastionzero-zli-nodejs`
        console.log(`We're getting here path: ${p}, configName: ${configName}`)
        this.levelDBPath = path.join(p, configName, 'store');
        // Make sure the path exists, and make it if it doesn't
        fs.existsSync(this.levelDBPath) || fs.mkdirSync(this.levelDBPath, { recursive: true });

        this.logoutOnTokenSetCleared(logoutDetectedSubject);
    }

    logoutOnTokenSetCleared(logoutDetectedSubject: Subject<boolean>): void {
        this.config.onDidChange('tokenSet', (newValue: TokenSetParameters, oldValue: TokenSetParameters) => {
            // detect if there is a change in the token set and the new value is undefined
            // (aka has been cleared) to notify whoever is listening that a logout has occurred
            if (newValue === undefined && oldValue) {
                logoutDetectedSubject.next(true);
            }
        });
    }

    async getTokenSet(): Promise<TokenSet> {
        let tokenSet: TokenSet;

        const db = new ClassicLevel(this.levelDBPath)
        try {
            const value = await db.get(tokenSetKey);
            tokenSet = JSON.parse(value);
        } catch (e) {} // key doesn't exist

        await db.close();

        return tokenSet && new TokenSet(tokenSet);
    }

    async getMrtap(): Promise<MrtapConfigSchema> {
        let mrtap: MrtapConfigSchema = getDefaultMrtapConfig();

        const db = new ClassicLevel(this.levelDBPath)
        try {
            const value = await db.get(mrtapKey);
            mrtap = JSON.parse(value);
        } catch (e) {} // key doesn't exist

        await db.close();

        return mrtap;
    }

    async setTokenSet(tokenSet: TokenSet): Promise<void> {
        const db = new ClassicLevel(this.levelDBPath)
        await db.put(tokenSetKey, JSON.stringify(tokenSet));
        await db.close();
    }

    async setMrtap(data: MrtapConfigSchema): Promise<void> {
        const db = new ClassicLevel(this.levelDBPath)
        await db.put(mrtapKey, JSON.stringify(data));
        await db.close();
    }

    async clearTokenSet(): Promise<void> {
        const db = new ClassicLevel(this.levelDBPath)
        await db.del(tokenSetKey);
        await db.close();
    }

    async clearMrtap(): Promise<void> {
        const db = new ClassicLevel(this.levelDBPath)
        await db.del(mrtapKey);
        await db.close();
    }
}