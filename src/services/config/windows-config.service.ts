import { TokenSet } from 'openid-client';
import path from 'path';
import { Subject } from 'rxjs';
import Registry from 'winreg';
import { getDefaultMrtapConfig, MrtapConfigSchema } from 'webshell-common-ts/mrtap.service/mrtap.service.types';
import { Config } from 'services/config/conf';
import { IConfig } from 'services/config/config.service';

const WINDOWS_REGISTRY_KEY = '\\Software\\BastionZero';

export class WindowsConfig extends Config implements IConfig {
    public readonly path: string;
    private regKey: Registry.Registry;

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
        let tokenSet: TokenSet;

        try {
            const result = await this.getWindowsRegistryValue('tokenSet');
            tokenSet = JSON.parse(result);
        } catch (err) {
            if (err && !this.isKeyNotFoundError(err)) {
                throw new Error(`Failed to get token set: ${err}`);
            }
        }

        return tokenSet && new TokenSet(tokenSet);
    }

    async getMrtap(): Promise<MrtapConfigSchema> {
        let mrtap: MrtapConfigSchema = getDefaultMrtapConfig();

        try {
            const result = await this.getWindowsRegistryValue('mrtap');
            mrtap = JSON.parse(result);
        } catch (err) {
            if (err && !this.isKeyNotFoundError(err)) {
                throw new Error(`Failed to get MrTAP config: ${err}`);
            }
        }

        return mrtap;
    }

    async setTokenSet(tokenSet: TokenSet): Promise<void> {
        await this.setWindowsRegistryValue('tokenSet', tokenSet);
    }

    async setMrtap(data: MrtapConfigSchema): Promise<void> {
        await this.setWindowsRegistryValue('mrtap', data);
    }

    async clearTokenSet(): Promise<void> {
        this.regKey.remove('tokenSet', (err: Error) => {
            if (err && !this.isKeyNotFoundError(err)) {
                throw new Error(`Failed to clear token set: ${err}`);
            }
        });
    }

    async clearMrtap(): Promise<void> {
        this.regKey.remove('mrtap', (err: Error) => {
            if (err && !this.isKeyNotFoundError(err)) {
                throw new Error(`Failed to clear MrTAP config: ${err}`);
            }
        });
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