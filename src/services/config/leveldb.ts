import fs from 'fs';
import path from 'path';
import os from 'os';

import { ClassicLevel } from 'classic-level';

const ModuleError = require('module-error')

export class Store {
    public readonly where: string;

    constructor(
        configName: string,
        configDir: string,
        projectName: string
    ) {
        // os standard locations
        if (!configDir) {
            switch (process.platform) {
                case 'win32':
                    configDir = path.join(process.env.LOCALAPPDATA, projectName);
                case 'darwin':
                    configDir = path.join(os.homedir(), 'Library', 'Preferences', projectName)
                default: // unix
                    configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), projectName)
            }
        }

        // Define where our db will be stored
        this.where = path.join(configDir, configName, 'store');

        // Make sure the path exists, and make it if it doesn't
        fs.existsSync(this.where) || fs.mkdirSync(this.where, { recursive: true });
    }

    // logoutOnTokenSetCleared(logoutDetectedSubject: Subject<boolean>): void {
    //     this.config.onDidChange('tokenSet', (newValue: TokenSetParameters, oldValue: TokenSetParameters) => {
    //         // detect if there is a change in the token set and the new value is undefined
    //         // (aka has been cleared) to notify whoever is listening that a logout has occurred
    //         if (newValue === undefined && oldValue) {
    //             logoutDetectedSubject.next(true);
    //         }
    //     });

    //     db.on('put', function (key, value) {
    //         console.log('Updated', { key, value })
    //     })
    // }

    public async get(key: string): Promise<string> {
        let value: string;

        const db = await this.open();
        try {
            value = await db.get(key);
        } catch (err) {
            if (err instanceof ModuleError) {
                if (err.code === 'LEVEL_NOT_FOUND') {
                    // if key doesn't exist, return undefined value
                }
            }
        } 

        await db.close();
        return value;
    }

    public async set(key: string, value: string): Promise<void> {
        const db = await this.open();
        await db.put(key, value);
        await db.close();
    }

    public async clear(key: string): Promise<void> {
        const db = await this.open();
        await db.del(key);
        await db.close();
    }

    private async open(): Promise<ClassicLevel<string, string>> {
        const db = new ClassicLevel(this.where)

        let count: number = 1;
        while(true) {
            switch (db.status) {
                case 'open':
                    console.log(`We opened the db on the ${count} try`)
                    return db
                case 'closed':
                    try {
                        await db.open()
                    } catch (err) {
                        if (err instanceof ModuleError) {
                            // console.error(`We hit an error!!! ${err.code}:${err.cause}`)
                            if (err.cause && err.cause.code === 'LEVEL_LOCKED') {
                                // Another process or instance has opened the database
                            }
                        }
                    }
            }
            count ++
        }
    }
}