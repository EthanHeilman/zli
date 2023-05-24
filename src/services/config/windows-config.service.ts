import { TokenSet } from 'openid-client';
import path from 'path';
import fs from 'fs';
import { ClassicLevel } from 'classic-level';
import { Subject } from 'rxjs';
import Registry from 'winreg';
import { getDefaultMrtapConfig, MrtapConfigSchema } from 'webshell-common-ts/mrtap.service/mrtap.service.types';
import { Config } from 'services/config/conf';
import { IConfig } from 'services/config/config.service';
import { mrtapKey, tokenSetKey, whoamiKey } from './leveldb';
const ModuleError = require('module-error')

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
        const p = `C:\\Users\\moleperson\\AppData\\Local\\bastionzero-zli`
        this.levelDBPath = path.join(p, configName, 'store');
        // Make sure the path exists, and make it if it doesn't
        fs.existsSync(this.levelDBPath) || fs.mkdirSync(this.levelDBPath, { recursive: true });

        this.logoutOnTokenSetCleared(logoutDetectedSubject);
    }

    logoutOnTokenSetCleared(logoutDetectedSubject: Subject<boolean>) {
        let oldValue: TokenSet;

        const a = async() => {
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 10))
                const newValue = await this.getTokenSet();
                if (newValue === undefined && oldValue) {
                    logoutDetectedSubject.next(true);
                }
                oldValue = newValue;
            }
        }
    }

    private async open(): Promise<ClassicLevel<string, string>> {
        const db = new ClassicLevel(this.levelDBPath)

        let count: number = 1;
        while(true) {
            switch (db.status) {
                case 'open':
                    console.log(`it worked we're open now took ${count} tries`)
                    return db
                case 'closed':
                    try {
                        await db.open()
                    } catch (err) {
                        if (err instanceof ModuleError) {
                            // console.error(`We hit an error!!! ${err.code}:${err.cause}`)
                            if (err.cause && err.cause.code === 'LEVEL_LOCKED') {
                                // Another process or instance has opened the database
                                // console.log(`LOCKED!!!!`)
                            }
                        }
                    }
            }
            count ++
            // console.log(`db status = ${db.status}`)

            await new Promise(resolve => setTimeout(resolve, 1))
        }
    }

    async getTokenSet(): Promise<TokenSet> {
        let tokenSet: TokenSet;

        const db = await this.open()
        try {
            const value = await db.get(tokenSetKey);
            tokenSet = JSON.parse(value);
        } catch (err) {
            if (err instanceof ModuleError) {
                console.error(`We hit an error!!! ${err.code}:${err.cause}`)
                if (err.cause && err.cause.code === 'LEVEL_LOCKED') {
                    // Another process or instance has opened the database
                    console.log(`LOCKED!!!!`)
                }
            }
        } // key doesn't exist

        await db.close();

        return tokenSet && new TokenSet(tokenSet);
    }

    async getMrtap(): Promise<MrtapConfigSchema> {
        let mrtap: MrtapConfigSchema = getDefaultMrtapConfig();

        const db = await this.open()
        try {
            // await db.open()
            const value = await db.get(mrtapKey);
            mrtap = JSON.parse(value);
        } catch (err) {
            if (err instanceof ModuleError) {
                console.error(`We hit an error!!! ${err.code}:${err.cause}`)
                if (err.cause && err.cause.code === 'LEVEL_LOCKED') {
                    // Another process or instance has opened the database
                    console.log(`LOCKED!!!!`)
                }
            }
        } // key doesn't exist

        await db.close();

        return mrtap;
    }

    async setTokenSet(tokenSet: TokenSet): Promise<void> {
        const db = await this.open()
        await db.put(tokenSetKey, JSON.stringify(tokenSet));
        await db.close();
    }

    async setMrtap(data: MrtapConfigSchema): Promise<void> {
        const db = await this.open()
        await db.put(mrtapKey, JSON.stringify(data));
        await db.close();
    }

    async clearTokenSet(): Promise<void> {
        console.log(`token set was cleared`)
        const db = await this.open()
        await db.del(tokenSetKey);
        await db.close();
    }

    async clearMrtap(): Promise<void> {
        const db = await this.open()
        await db.del(mrtapKey);
        await db.close();
    }
}