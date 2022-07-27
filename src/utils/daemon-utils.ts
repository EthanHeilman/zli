import path from 'path';
import fs from 'fs';
import utils from 'util';
import { cleanExit } from '../handlers/clean-exit.handler';
import { Logger } from '../services/logger/logger.service';
import { waitUntilUsedOnHost } from 'tcp-port-used';
import { ConfigService } from '../services/config/config.service';
import { LoggerConfigService } from '../services/logger/logger-config.service';
import { ShellConnectionAuthDetails } from '../../webshell-common-ts/http/v2/connection/types/shell-connection-auth-details.types';

import { spawn, SpawnOptionsWithStdioTuple, StdioNull } from 'child_process';
import {portToPid} from 'pid-port';
import readLastLines from 'read-last-lines';
import randtoken from 'rand-token';
import getPort from 'get-port';

export const DAEMON_PATH : string = 'bzero/bctl/daemon/daemon';

const WAIT_UNTIL_USED_ON_HOST_TIMEOUT = 1000 * 60;
const WAIT_UTIL_USED_ON_HOST_RETRY_TIME = 100;

// Allow errors on early daemon startup to bubble up to the user
export async function handleServerStart(logPath: string, localPort: number, localHost: string) {
    await new Promise<void>(async (resolve, reject) => {
        await waitUntilUsedOnHost(localPort, localHost, WAIT_UTIL_USED_ON_HOST_RETRY_TIME, WAIT_UNTIL_USED_ON_HOST_TIMEOUT).then(function() {
            resolve();
        }, function(err) {
            if (fs.existsSync(logPath)) {
                readLastLines.read(logPath, 1)
                    .then((line: string) => {
                        try {
                            const lastLog = JSON.parse(line);
                            reject(`Error kept daemon from starting up correctly\n. waitUntilUsedOnHost error: ${err}. Last daemon log entry: ${lastLog.message}`);
                        }
                        catch(e) {
                            reject(`Error parsing last line in log: ${e}`);
                        }
                    });
            } else {
                throw reject('Daemon failed to create log file');
            }
        });
    }).catch((e: any) => {
        throw e;
    });
}

export function getAppEntrypoint() {
    const pkgProcess = isPkgProcess();

    if(pkgProcess) {
        return pkgProcess.entrypoint;
    } else {
        return `${process.cwd()}/src/index.ts`;
    }
}

export function getAppExecPath() {
    if(isPkgProcess()) {
        return process.execPath;
    } else {
        return 'npx ts-node';
    }
}


/**
 * This function will generate a new cert to use for a daemon application (i.e. kube, web server)
 * @param {string} pathToConfig Path to our zli config
 * @param {string} name name of the application (i.e. kube)
 * @param {string} configName  Dev, stage, prod
 * @returns Path to the key, path to the cert, path to the certificate signing request.
 */
export async function generateNewCert(pathToConfig: string, name: string, configName: string ): Promise<string[]> {
    const options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioNull> = { stdio: ['ignore', 'ignore', 'ignore'] };

    // Create and save key/cert
    const createCertPromise = new Promise<string[]>(async (resolve, reject) => {
        // Only add the prefix for non-prod
        let prefix = '';
        if (configName !== 'prod') {
            prefix = `-${configName}`;
        }

        const pathToKey = path.join(pathToConfig, `${name}Key${prefix}.pem`);
        const pathToCsr = path.join(pathToConfig, `${name}Csr${prefix}.pem`);
        const pathToCert = path.join(pathToConfig, `${name}Cert${prefix}.pem`);

        // Generate a new key
        try {
            spawn(`openssl genrsa -out ${pathToKey}`, options);
        } catch (e: any) {
            reject(e);
        }

        // Generate a new csr
        // Ref: https://www.openssl.org/docs/man1.0.2/man1/openssl-req.html
        try {
            const pass = randtoken.generate(128);
            spawn(`openssl req -sha256 -passin pass:${pass} -new -key ${pathToKey} -subj "/C=US/ST=Bastionzero/L=Boston/O=Dis/CN=bastionzero.com" -out ${pathToCsr}`, options);
        } catch (e: any) {
            reject(e);
        }

        // Now generate the certificate
        // https://www.openssl.org/docs/man1.1.1/man1/x509.html
        try {
            spawn(`openssl x509 -req -days 999 -in ${pathToCsr} -signkey ${pathToKey} -out ${pathToCert}`, options);
        } catch (e: any) {
            reject(e);
        }

        resolve([pathToKey, pathToCert, pathToCsr]);
    });

    return await createCertPromise;
}


export function isPkgProcess() {
    const process1 = <any>process;
    return process1.pkg;
}

export async function startDaemonInDebugMode(finalDaemonPath: string, cwd: string, env: object, args: string[]) {
    const startDaemonPromise = new Promise<void>(async (resolve) => {
        // Start our daemon process in its own process group, but stream our stdio to the user (pipe)
        const daemonProcess = spawn(finalDaemonPath, args,
            {
                cwd: cwd,
                env: {...env, ...process.env},
                shell: true,
                detached: true,
                stdio: 'inherit'
            }
        );

        process.on('SIGINT', () => {
            // CNT+C Sent from the user, kill the daemon process, which will trigger an exit
            killPid(daemonProcess?.pid.toString());
        });

        daemonProcess.on('exit', function () {
            // Whenever the daemon exits, exit
            resolve();
            process.exit();
        });
    });
    await startDaemonPromise;
}

export async function copyExecutableToLocalDir(logger: Logger, configPath: string): Promise<string> {
    // Helper function to copy the Daemon executable to a local dir on the file system
    // Ref: https://github.com/vercel/pkg/issues/342

    let prefix = '';
    if(isPkgProcess()) {
        // /snapshot/zli/dist/src/handlers/tunnel
        prefix = path.join(__dirname, '../../../');
    } else {
        // /zli/src/handlers/tunnel
        prefix = path.join(__dirname, '../../');
    }

    // First get the parent dir of the config path
    const configFileDir = path.dirname(configPath);

    const chmod = utils.promisify(fs.chmod);

    // Our copy function as we cannot use fs.copyFileSync
    async function copy(source: string, target: string) {
        return new Promise<void>(async function (resolve, reject) {
            const ret = await fs.createReadStream(source).pipe(fs.createWriteStream(target), { end: true });
            ret.on('close', () => {
                resolve();
            });
            ret.on('error', () => {
                reject();
            });
        });

    }

    let daemonExecPath = undefined;
    let finalDaemonPath = undefined;
    if (process.platform === 'linux' || process.platform === 'darwin') {
        daemonExecPath = path.join(prefix, DAEMON_PATH);

        finalDaemonPath = path.join(configFileDir, 'daemon');
    } else {
        logger.error(`Unsupported operating system: ${process.platform}`);
        await cleanExit(1, logger);
    }

    await deleteIfExists(finalDaemonPath);

    // Create our executable file
    fs.writeFileSync(finalDaemonPath, '');

    // Copy the file to the computers file system
    await copy(daemonExecPath, finalDaemonPath);

    // Grant execute permission
    await chmod(finalDaemonPath, 0o755);

    // Return the path
    return finalDaemonPath;
}

async function deleteIfExists(pathToFile: string) {
    // Check if the file exists, delete if so
    if (fs.existsSync(pathToFile)) {
        // Delete the file
        fs.unlinkSync(pathToFile);
    }
}

/**
 * Helper function to kill a daemon process
 * @param {number} localPid Local pid we are trying to kill
 * @param {Logger} logger Logger
 */
export async function killDaemon(localPid: number, logger: Logger) {
    // then kill the daemon
    if ( localPid != null) {
        // First try to kill the process
        try {
            killPid(localPid.toString());
        } catch (err: any) {
            // If the daemon pid was killed, or doesn't exist, just continue
            logger.warn(`Attempt to kill existing daemon failed. This is expected if the daemon has been killed already. Make sure no program is using pid: ${localPid}. Try running \`kill -9 ${localPid}\``);
            logger.debug(`Error: ${err}`);
        }
    }
}

/**
 * Helper function to check if we have saved a local pid for a daemon and attempts to kill
 * This function will also alert a user if a local port is in use
 * @param {number} savedPid Saved pid in our config
 * @param {number} localPort Local port we are trying to use
 * @param {Logger} logger Logger
 */
export async function killLocalPortAndPid(savedPid: number, localPort: number, logger: Logger) {
    // Check if we've already started a process
    if (savedPid != null) {
        killDaemon(savedPid, logger);
    }

    // Also check if anything is using that local port
    const portPids = await getPidForPort(localPort);
    if (portPids.length != 0) {
        logger.error(`It looks like an application is using port: ${localPort}`);
        await cleanExit(1, logger);
    }
}

export async function killPortProcess(port: number, logger: Logger) {
    if(port == null) return;

    // Helper function to kill a process running on a given port (if it exists)
    try {
        const portPids = await getPidForPort(port);

        // Loop over all pids and kill
        portPids.forEach( (portPid: number) => {
            killPid(portPid.toString());
        });
    } catch(err) {
        // Don't try to capture any errors incase the process has already been killed
        logger.debug(`Error killing process on port ${port}: ${err}`);
    }
}

/**
 * Helper function to get a pids from a port number
 * @param port Port number we are looking for
 * @returns The process Ids using that port
 */
async function getPidForPort(port: number): Promise<number[]> {
    const ports = new Promise<number[]>(async (resolve, _) => {
        portToPid(port).then((pids: any) => {
            resolve(pids.tcp);
        });
    });
    const awaitedPorts = await ports;
    return awaitedPorts;
}

function killPid(pid: string) {
    // Helper function to kill a process for a given pid
    // Ignore output and do not show that to the user
    // For unix based os we kill all processes based on group id by using kill -{signal} -{pid}
    // https://stackoverflow.com/a/49842576/9186330
    const options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioNull> = { stdio: ['ignore', 'ignore', 'ignore'] };
    spawn(`kill -9 -${pid}`, options);
}

/**
 * Helper function to get common environment variables to set for the daemon process
 */
export function getBaseDaemonEnv(configService: ConfigService, loggerConfigService: LoggerConfigService, agentPubKey: string, connectionId: string, authDetails: ShellConnectionAuthDetails) {
    // Build the refresh command so it works in the case of the pkg'd app which
    // is expecting a second argument set to internal main script
    // This is a work-around for pkg recursive binary issue see https://github.com/vercel/pkg/issues/897
    // https://github.com/vercel/pkg/issues/897#issuecomment-679200552
    const execPath = getAppExecPath();
    const entryPoint = getAppEntrypoint();

    return {
        'SESSION_ID': configService.getSessionId(),
        'SESSION_TOKEN': configService.getSessionToken(),
        'SERVICE_URL': configService.serviceUrl().slice(0, -1).replace('https://', ''),
        'AUTH_HEADER': configService.getAuthHeader(),
        'CONFIG_PATH': configService.configPath(),
        'REFRESH_TOKEN_COMMAND': `${execPath} ${entryPoint} refresh`,
        'LOG_PATH': loggerConfigService.daemonLogPath(),
        'AGENT_PUB_KEY': agentPubKey,
        'CONNECTION_ID': connectionId,
        'CONNECTION_SERVICE_URL': authDetails.connectionServiceUrl,
        'CONNECTION_SERVICE_AUTH_TOKEN': authDetails.authToken,
    };
}

/**
 * Helper function to get the localHost value (or return the default value)
 * @param {string} passedLocalhost This is the value of the localhost saved in our DB
 */
export function getOrDefaultLocalhost(passedLocalhost: string): string {
    if (passedLocalhost == null) {
        return 'localhost';
    };
    return passedLocalhost;
}

/**
 * Helper function that returns an available TCP port on the user's machine. If
 * the user has configured a local port on BastionZero, then this function does
 * not look for an available port and returns what's stored on BastionZero.
 * @param {number} passedLocalport This is the value of the localport saved in
 * BastionZero's DB
 * @returns Port to use for daemon
 */
export async function getOrDefaultLocalport(passedLocalport: number): Promise<number> {
    if (passedLocalport == null) {
        const availablePort = await getPort();
        return availablePort;
    };
    return passedLocalport;
}