import { TokenSet } from 'openid-client';
import path from 'path';
import fs from 'fs';
import leveldown from 'leveldown';
import levelup from 'levelup';
import { Subject } from 'rxjs';
import Registry from 'winreg';
import { getDefaultMrtapConfig, MrtapConfigSchema } from '../../../webshell-common-ts/mrtap.service/mrtap.service.types';
import { Config } from './conf';
import { IConfig } from './config.service';
import { mrtapKey, tokenSetKey, whoamiKey } from './leveldb';

const WINDOWS_REGISTRY_KEY = '\\Software\\BastionZero';

export class WindowsConfig extends Config implements IConfig {
    public readonly path: string;
    private regKey: Registry.Registry;
    private levelDBPath: string;

    constructor(
        projectName: string,
        configName: string,
        configDir: string,
        isSystemTest: boolean,
        logoutDetectedSubject: Subject<boolean>,
        serviceUrl?: string,
    ) {
        if (!configDir) {
            // conf defaults to roaming app data but our stuff belongs in local
            configDir = path.join(process.env.LOCALAPPDATA, projectName);
        }

        let watch = true;
        if (isSystemTest != undefined && isSystemTest == true) {
            watch = false;
        }

        super(watch, projectName, configName, configDir, {}, serviceUrl);

        // The Windows Registry is key-value storage. It has "hives" which are the root
        // keys and generally separate out further nesting into priveleged categories.
        // Because our config values are on a per-user basis we use the HKEY_CURRENT_USER
        // hive. Additionally, our key lives in the application ("Software") section in a
        // special new subkey "BastionZero"

        // Create our registry object for interacting with the Windows Registry
        this.regKey = new Registry({
            // registry hive HKEY_CURRENT_USER because our config values are per user
            hive: Registry.HKCU,
            key:  WINDOWS_REGISTRY_KEY
        });

        // Create our Windows Registry key, no-op if already exists
        this.regKey.create((err: Error) => {
            if (err) {
                throw new Error(`Failed to create new key in Window's Registry: ${err}`);
            }
        });

        // for testing leveldb
        this.levelDBPath = path.join(configDir, configName, 'store');
        // Make sure the path exists, and make it if it doesn't
        fs.existsSync(this.levelDBPath) || fs.mkdirSync(this.levelDBPath, { recursive: true });

        this.logoutOnTokenSetCleared(logoutDetectedSubject);
    }

    logoutOnTokenSetCleared(logoutDetectedSubject: Subject<boolean>) {
        let oldValue: TokenSet;
        setInterval(async () => {
            const newValue = await this.getTokenSet();
            if (newValue === undefined && oldValue) {
                logoutDetectedSubject.next(true);
            }
            oldValue = newValue;
        }, 1000);
    }

    async getTokenSet(): Promise<TokenSet> {
        let tokenSet: TokenSet = new TokenSet(undefined);

        const db = levelup(leveldown(this.levelDBPath));
        try {
            const value = await db.get(tokenSetKey);
            tokenSet = JSON.parse(value.toString());
        } catch (e) {} // key doesn't exist

        await db.close();

        return tokenSet;
    }

    async getMrtap(): Promise<MrtapConfigSchema> {
        let mrtap: MrtapConfigSchema = getDefaultMrtapConfig();

        const db = levelup(leveldown(this.levelDBPath));
        try {
            const value = await db.get(mrtapKey);
            mrtap = JSON.parse(value.toString());
        } catch (e) {} // key doesn't exist

        await db.close();

        return mrtap;
    }

    async setTokenSet(tokenSet: TokenSet): Promise<void> {
        const db = levelup(leveldown(this.levelDBPath));
        await db.put(tokenSetKey, JSON.stringify(tokenSet));
        await db.close();
    }

    async setMrtap(data: MrtapConfigSchema): Promise<void> {
        const db = levelup(leveldown(this.levelDBPath));
        await db.put(mrtapKey, JSON.stringify(data));
        await db.close();
    }

    async clearTokenSet(): Promise<void> {
        const db = levelup(leveldown(this.levelDBPath));
        await db.del(tokenSetKey);
        await db.close();
    }

    async clearMrtap(): Promise<void> {
        const db = levelup(leveldown(this.levelDBPath));
        await db.del(mrtapKey);
        await db.close();
    }

    private async getWindowsRegistryValue(key: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.regKey.get(key, (err: Error, result: Registry.RegistryItem) => {
                if (err) {
                    reject(err);
                }

                if (result != null) {
                    resolve(result.value);
                } else {
                    // If our result is null then it means the value exists but it's been cleared
                    resolve(undefined);
                }
            });
        });
    }

    private async setWindowsRegistryValue(key: string, value: any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.regKey.set(key, Registry.REG_SZ, JSON.stringify(value), (err: Error) => {
                if (err) {
                    reject(new Error(`Failed to save ${key} configuration: ${err}`));
                }
                resolve();
            });
        });
    }

    private isKeyNotFoundError(err: Error): boolean {
        // Sometimes we try to clear or get a token that has already been cleared, which means
        // we'll hit an error letting us know the key doesn't exist. This is a result of the
        // nature of the winreg remove() function.
        // ref: https://fresc81.github.io/node-winreg/Registry.html#remove__anchor
        return err.message.includes('The system was unable to find the specified registry key or value');
    }
}