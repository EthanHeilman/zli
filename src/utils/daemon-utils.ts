import * as cp from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import forge from 'node-forge';
import path from 'path';
import { check as checkTcpPort, waitUntilUsedOnHost } from 'tcp-port-used';
import utils from 'util';
import { version } from '../../package.json';
import { CreateUniversalConnectionResponse } from '../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { ShellConnectionAuthDetails } from '../../webshell-common-ts/http/v2/connection/types/shell-connection-auth-details.types';
import { ILogger } from '../../webshell-common-ts/logging/logging.types';
import { cleanExit } from '../handlers/clean-exit.handler';
import { ConfigService } from '../services/config/config.service';
import { DaemonConfig } from '../services/config/config.service.types';
import { LoggerConfigService } from '../services/logger/logger-config.service';
import { Logger } from '../services/logger/logger.service';
import { ProcessManagerService } from '../services/process-manager/process-manager.service';
import { KillProcessResultType } from '../services/process-manager/process-manager.service.types';
import { DAEMON_EXIT_CODES } from './daemon-exit-codes';
import { toUpperCase } from './utils';
import { Observable } from 'rxjs';

const pids = require('port-pid');
const readLastLines = require('read-last-lines');
const findPort = require('find-open-port');
const lockfile = require('proper-lockfile');


export const DAEMON_PATH : string = 'bzero/bctl/daemon/daemon';

const WAIT_UNTIL_USED_ON_HOST_TIMEOUT = 1000 * 60;
const WAIT_UTIL_USED_ON_HOST_RETRY_TIME = 100;

/**
 * spawns daemon as a subprocess with inherited stdio and returns a promise that
 * resolves when the daemon process exits with an exit code
 * @param logger the logger service to use to report errors if the daemon exits
 * @param daemonPath path to the daemon process
 * @param args args to pass to the daemon
 * @param customEnv any custom environment variables to set for the spawned
 * process in addition to parent process environment
 * @param cwd current working directory to use for the spawned subprocess
 * @param logoutDetected optionally provide an observable that fires when the user logs out
 * @returns A promise that resolves with the daemon process exit code
 */
export function spawnDaemon(
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    daemonPath: string,
    args: string[],
    customEnv: object,
    logoutDetected: Observable<boolean> | null,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const daemonDir = path.dirname(daemonPath);
        // Windows can handle our executable's name, but unix has to have the path reference
        const daemonFile = (process.platform === 'win32') ? path.basename(daemonPath) : `./${path.basename(daemonPath)}`;

        try {
            const options: cp.SpawnOptions = {
                cwd: daemonDir,
                env: { ...customEnv, ...process.env },
                detached: false,
                shell: true,
                stdio: 'inherit',
            };

            const daemonProcess = cp.spawn(daemonFile, args, options);
            resolve(waitForDaemonProcessExit(logger, loggerConfigService, daemonProcess, logoutDetected));
        }
        catch(err) {
            reject(err);
        }
    });
}

/**
 * Starts the daemon as a background process with stdio ignored. If the daemon
 * process exits with an error the zli process will log any custom error
 * messages and then exit.
 * @param logger Logger service to use for logging custom errors and clean exit
 * @param cwd current working directory to start daemon process in
 * @param daemonPath path to daemon executable
 * @param args daemon command line args
 * @param customEnv any custom environment variables to set for the spawned
 * process in addition to parent process environment
 * @param logoutDetected optionally provide an observable that fires when the user logs out
 * @returns The spawned child process
 */
export async function spawnDaemonInBackground(
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    cwd: string,
    daemonPath: string,
    args: string[],
    customEnv: object,
    logoutDetected: Observable<boolean> | null,
): Promise<cp.ChildProcess> {
    const options: cp.SpawnOptions = {
        cwd: cwd,
        env: { ...customEnv, ...process.env },
        detached: true,
        shell: false,
        stdio: 'ignore',
    };

    const daemonProcess = await cp.spawn(daemonPath, args, options);

    reportDaemonExitErrors(logger, loggerConfigService, daemonProcess, logoutDetected);

    return daemonProcess;
}

export async function reportDaemonExitErrors(
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    daemonProcess: cp.ChildProcess,
    logoutDetected: Observable<boolean> | null,
): Promise<void> {
    // If the daemon process exits while the zli process is still running then
    // report any custom errors and exit the zli as well
    waitForDaemonProcessExit(logger, loggerConfigService, daemonProcess, logoutDetected)
        .then(async exitCode => await cleanExit(exitCode, logger));
}

// Allow errors on early daemon startup to bubble up to the user
export async function handleServerStart(logPath: string, localPort: number, localHost: string) {
    await new Promise<void>(async (resolve, reject) => {
        await waitUntilUsedOnHost(localPort, localHost, WAIT_UTIL_USED_ON_HOST_RETRY_TIME, WAIT_UNTIL_USED_ON_HOST_TIMEOUT).then(function() {
            resolve();
        }, function(err) {
            let errMsg = `Error waiting for daemon to start on ${localHost}:${localPort}: ${err}`;
            if (fs.existsSync(logPath)) {
                readLastLines.read(logPath, 1)
                    .then((line: string) => {
                        try {
                            const lastLog = JSON.parse(line);
                            errMsg += `\nLast daemon log entry: ${lastLog.message}`;
                            reject(errMsg);
                        }
                        catch(e) {
                            errMsg += `\nError parsing last line in daemon log file: ${e}`;
                            reject(errMsg);
                        }
                    });
            } else {
                errMsg += '\nDaemon failed to create log file';
                throw reject(errMsg);
            }
        });
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

export interface DaemonTLSCert {
    pathToKey: string;
    pathToCert: string;
    pathToCsr: string;
}

/**
 * This function will generate a new cert to use for a daemon application (i.e. kube, web server)
 * @param {string} pathToConfig Path to our zli config
 * @param {string} name name of the application (i.e. kube)
 * @param {string} configName  Dev, stage, prod
 * @returns Path to the key, path to the cert, path to the certificate signing request.
 */
export async function generateNewCert(pathToConfig: string, name: string, configName: string): Promise<DaemonTLSCert> {
    // Create and save key/cert
    const createCertPromise = new Promise<DaemonTLSCert>(async (resolve, reject) => {
        // Only add the prefix for non-prod
        let prefix = '';
        if (configName !== 'prod') {
            prefix = `-${configName}`;
        }

        const pathToKey = path.join(pathToConfig, `${name}Key${prefix}.pem`);
        const pathToCsr = path.join(pathToConfig, `${name}Csr${prefix}.pem`);
        const pathToCert = path.join(pathToConfig, `${name}Cert${prefix}.pem`);

        const subject = [{
            type: 'commonName',
            shortName: 'CN',
            value: 'bastionzero.com'
        }, {
            type: 'countryName',
            shortName: 'C',
            value: 'US'
        }, {
            type: 'stateOrProvinceName',
            shortName: 'ST',
            value: 'Massachusetts'
        }, {
            type: 'localityName',
            shortName: 'L',
            value: 'Boston'
        }, {
            type: 'organizationName',
            name: 'O',
            value: 'BastionZero Inc.'
        }];

        try {
            // generate a keypair and create an X.509v3 certificate
            const keys = forge.pki.rsa.generateKeyPair(2048);

            // write keys to file
            const pkPem = forge.pki.privateKeyToPem(keys.privateKey);
            fs.writeFileSync(pathToKey, pkPem, { mode: 0o600 });

            // create certificate request
            const csr = forge.pki.createCertificationRequest();
            csr.publicKey = keys.publicKey;
            csr.setSubject(subject as forge.pki.CertificateField[]);

            // sign certification request
            csr.sign(keys.privateKey);

            // write certificate request to file
            const csrPem = forge.pki.certificationRequestToPem(csr);
            fs.writeFileSync(pathToCsr, csrPem, { mode: 0o600 });

            const cert = forge.pki.createCertificate();
            cert.publicKey = csr.publicKey;
            cert.subject = csr.subject;
            cert.serialNumber = '01';
            cert.setIssuer(subject);

            // add validity duration
            cert.validity.notBefore = new Date();
            cert.validity.notAfter = new Date();
            cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

            // sign certificate
            cert.sign(keys.privateKey);

            const certPem = forge.pki.certificateToPem(cert);
            fs.writeFileSync(pathToCert, certPem, { mode: 0o600 });
        } catch (e: any) {
            reject(e);
        }

        resolve({
            pathToKey: pathToKey,
            pathToCert: pathToCert,
            pathToCsr: pathToCsr
        });
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
        const daemonProcess = await spawn(finalDaemonPath, args,
            {
                cwd: cwd,
                env: {...env, ...process.env},
                shell: true,
                detached: true,
                stdio: 'inherit',
            }
        );

        const processManager = new ProcessManagerService();

        process.on('SIGINT', () => {
            // CTL+C sent from the user, kill the daemon process, which will trigger an exit
            processManager.killProcess(daemonProcess.pid);
        });

        daemonProcess.on('exit', function () {
            // Whenever the daemon exits, exit
            resolve();
            process.exit();
        });
    });
    await startDaemonPromise;
}

// Helper function to copy the Daemon executable to a local dir on the file system
// Ref: https://github.com/vercel/pkg/issues/342
export async function copyExecutableToLocalDir(logger: Logger, configPath: string): Promise<string> {
    let prefix = '';
    if (isPkgProcess()) {
        // /snapshot/zli/dist/src/handlers/tunnel
        prefix = path.join(__dirname, '../../../');
    } else {
        // /zli/src/handlers/tunnel
        prefix = path.join(__dirname, '../../');
    }

    const daemonName = 'daemon-' + version;
    const configDir = path.dirname(configPath);

    let daemonExecPath: string;
    let finalDaemonPath: string;

    if (process.platform === 'win32') {
        daemonExecPath = path.join(prefix, DAEMON_PATH + '.exe');
        finalDaemonPath = path.join(configDir, daemonName + '.exe');
    } else { // platform is unix
        daemonExecPath = path.join(prefix, DAEMON_PATH);
        finalDaemonPath = path.join(configDir, daemonName);
    }
    if (fs.existsSync(finalDaemonPath)) {
        return finalDaemonPath;
    }

    await lockfile.lock('copyExecutableToLocalDir', {
        realpath: false,
        stale: 5000, // 5 seconds
        retries: 5
    })
        .then(async () => {
            // If, by the time we get our lock, the file exists because a different process
            // created it
            if (fs.existsSync(finalDaemonPath)) {
                return;
            }

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

            // Best effort removal of any old daemon executables
            const files = fs.readdirSync(configDir);
            files.forEach(file => {
                if (file.includes('daemon')){
                    try {
                        fs.rmSync(path.join(configDir, file));
                    } catch (e) {
                        logger.warn(`failed to delete previous daemon executable ${file}: ${e}`);
                    }
                }
            });

            // Copy the file to the computers file system
            await copy(daemonExecPath, finalDaemonPath);

            // Grant execute permission
            const chmod = utils.promisify(fs.chmod);
            await chmod(finalDaemonPath, 0o755);

            return lockfile.unlockSync('copyExecutableToLocalDir', {
                realpath: false,
                stale: 5000
            });
        })
        .catch((e: Error) => {
            // either lock could not be acquired or releasing it failed
            console.error(e);
        });

    return finalDaemonPath;
}

export function logKillDaemonResult(daemonIdentifier: string, result: KillProcessResultType, logger: ILogger) {
    switch (result) {
    case 'killed_gracefully':
        logger.info(`${daemonIdentifier} shut down gracefully`);
        break;
    case 'killed_forcefully':
        logger.info(`${daemonIdentifier} shut down forcefully`);
        break;
    case 'no_longer_exists':
        logger.info(`Cannot shut down ${daemonIdentifier} because it no longer exists`);
        break;
    default:
        // Compile-time exhaustive check
        const exhaustiveCheck: never = result;
        throw new Error(`Unhandled case: ${exhaustiveCheck}`);
    }
}

/**
 * Helper function to kill a daemon process and log the results
 * @param {number} daemon The daemon to kill
 * @param {Logger} logger Logger
 */
export async function killDaemonAndLog(daemon: DaemonConfig, logger: ILogger) {
    // Check if we've already started a process
    if (daemon.localPid != null) {
        try {
            const processManager = new ProcessManagerService();
            logger.info(`Waiting for ${daemon.type} daemon to shut down...`);
            const result = await processManager.tryKillProcess(daemon.localPid);
            const id = `${toUpperCase(daemon.type)} daemon (PID: ${daemon.localPid})`;
            logKillDaemonResult(id, result, logger);
        } catch (e: any) {
            logger.warn(`Attempt to shut down the daemon running on PID ${daemon.localPid} failed: ${e}\nConsider running \'kill -9 ${daemon.localPid}\' to force kill it`);
        }
    }
}

/**
 * Helper function to check if we have saved a local pid for a daemon and attempts to kill
 * This function will also alert a user if a local port is in use
 * @param {number} localPort Local port we are trying to use
 * @param {Logger} logger Logger
 */
export async function killLocalPortAndPid(daemon: DaemonConfig, localPort: number, logger: Logger) {
    await killDaemonAndLog(daemon, logger);

    // Also check if anything is using that local port
    await checkIfPortAvailable(localPort);
}

export async function checkIfPortAvailable(port: number) {
    const isPortInUse = await checkTcpPort(port, 'localhost');
    if (isPortInUse) {
        throw new Error(`It looks like an application is using port: ${port}`);
    }
}

export async function killPortProcess(port: number, logger: Logger) {
    if(port == null) return;
    logger.debug(`Killing processes listening to port: ${port}`);

    // Helper function to kill a process running on a given port (if it exists)
    try {
        const portPids = await getPidForPort(port);
        const processManager = new ProcessManagerService();

        // Loop over all pids and kill
        portPids.forEach( (portPid: number) => {
            processManager.killProcess(portPid);
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
        pids(port).then((pids: any) => {
            resolve(pids.tcp);
        });
    });
    const awaitedPorts = await ports;
    return awaitedPorts;
}

/**
 * Helper function to get common environment variables to set for the daemon process
 */
export async function getBaseDaemonEnv(configService: ConfigService, loggerConfigService: LoggerConfigService, agentPubKey: string, connectionId: string, authDetails: ShellConnectionAuthDetails) {
    // Build the refresh command so it works in the case of the pkg'd app which
    // is expecting a second argument set to internal main script
    // This is a work-around for pkg recursive binary issue see https://github.com/vercel/pkg/issues/897
    // https://github.com/vercel/pkg/issues/897#issuecomment-679200552
    const execPath = getAppExecPath();
    const entryPoint = getAppEntrypoint();

    return {
        'SESSION_ID': configService.getSessionId(),
        'SESSION_TOKEN': configService.getSessionToken(),
        'SERVICE_URL': configService.getServiceUrl().slice(0, -1).replace('https://', ''),
        'AUTH_HEADER': await configService.getAuthHeader(),
        'CONFIG_PATH': configService.getConfigPath(),
        'REFRESH_TOKEN_COMMAND': `${execPath} ${entryPoint} refresh`,
        'LOG_PATH': loggerConfigService.daemonLogPath(),
        'AGENT_PUB_KEY': agentPubKey,
        'CONNECTION_ID': connectionId,
        'CONNECTION_SERVICE_URL': authDetails.connectionServiceUrl,
        'CONNECTION_SERVICE_AUTH_TOKEN': authDetails.authToken,
        'DEBUG': loggerConfigService.debugMode()
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
        const availablePort = await findPort();
        return availablePort;
    };
    return passedLocalport;
}

/**
 * Returns a promise that resolves when the daemon child process exits. Will
 * also handle any custom error codes by logging specific error messages to the
 * user
 * @param logger logger for reporting custom errors
 * @param loggerConfigService used to point the user to the daemon log path
 * @param daemonProcess the daemon child process
 * @param logoutDetected optionally provide an observable that fires when the user logs out
 * @returns The daemon process' exit code
 */
export function waitForDaemonProcessExit(
    logger: Logger,
    loggerConfigService: LoggerConfigService,
    daemonProcess: cp.ChildProcess,
    logoutDetected: Observable<boolean> | null,
): Promise<number> {
    return new Promise((resolve) => {
        logoutDetected?.subscribe(() => {
            logger.error(`\nLogged out by another zli instance. Terminating connection...\n`);
            daemonProcess.kill();
        });

        daemonProcess.on('close', (exitCode) => {
            if (exitCode !== 0) {
                // Note: if using the ZLI_CUSTOM_DAEMON_PATH environment variable
                // while developing we will instead use `go run` to start the daemon
                // which will only return error codes from the `go run` program and
                // not any of our custom daemon exit codes
                // https://stackoverflow.com/questions/55731760/go-os-exit2-show-a-bash-value-of-1
                switch (exitCode) {
                case DAEMON_EXIT_CODES.BZCERT_ID_TOKEN_ERROR: {
                    logger.error('Error constructing BastionZero certificate: IdP tokens are invalid/expired. Please try logging in again with \'zli login\' to resolve this issue.');
                    break;
                }
                case DAEMON_EXIT_CODES.CANCELLED_BY_USER: {
                    logger.info('Cancelled!');
                    // don't report an error in this case
                    exitCode = 0;
                    break;
                }
                case DAEMON_EXIT_CODES.SERVICE_ACCOUNT_NOT_CONFIGURED: {
                    logger.error('Failed to connect: this service account has not been configured on the target');
                    break;
                }
                case DAEMON_EXIT_CODES.ZLI_CONFIG_ERROR: {
                    logger.error('Error parsing zli config file. Please try logging in again with \'zli login\' to resolve this issue');
                    break;
                }
                case DAEMON_EXIT_CODES.USER_NOT_FOUND:
                case DAEMON_EXIT_CODES.POLICY_EDITED_DISCONNECT:
                case DAEMON_EXIT_CODES.POLICY_DELETED_DISCONNECT:
                case DAEMON_EXIT_CODES.IDLE_TIMEOUT: {
                    // don't report an error in this case -- handled by upstream processes'
                    break;
                }
                case DAEMON_EXIT_CODES.CONNECTION_REFUSED: {
                    logger.error('Connection Refused. Make sure remote address is correct and that database is active and listening on the other side');
                    break;
                }
                case DAEMON_EXIT_CODES.CONNECTION_FAILED: {
                    logger.error('Failed to establish connection');
                    break;
                }
                case DAEMON_EXIT_CODES.DB_NO_TLS: {
                    logger.error('Database misconfiguration: SplitCert requires databases to accept SSL/TLS connections');
                    break;
                }
                case DAEMON_EXIT_CODES.CLIENT_CERT_COSIGN_ERROR: {
                    logger.error('Bastion failed to cosign certificate: please contact BastionZero help desk');
                    break;
                }
                case DAEMON_EXIT_CODES.PWDB_MISSING_KEY: {
                    logger.error('Missing SplitCert key, please make sure your agent has been configured with the appropriate key to access the target');
                    break;
                }
                case DAEMON_EXIT_CODES.PWDB_UNKNOWN_AUTHORITY: {
                    logger.error('Server authenticating with unknown root certificate authority');
                    break;
                }
                case DAEMON_EXIT_CODES.SERVER_CERT_EXPIRED: {
                    logger.error('Database server certificate has expired or is not yet valid');
                    break;
                }
                case DAEMON_EXIT_CODES.INCORRECT_SERVER_NAME: {
                    logger.error('Server presented certificate with a different name than expected. There may be a misconfiguration issue');
                    break;
                }
                case DAEMON_EXIT_CODES.DAEMON_PANIC: {
                    logger.error(`Daemon process terminated unexpectedly -- for more details, try running the zli with the --debug flag set`);
                    break;
                }
                case DAEMON_EXIT_CODES.FAILED_TO_START_126:
                case DAEMON_EXIT_CODES.FAILED_TO_START_127:
                case null: {
                    logger.error(`Failed to establish connection to target, Please try again or contact your administrator`);
                    break;
                }
                default: {
                    logger.error(`Daemon process closed with nonzero exit code ${exitCode} -- for more details, see ${loggerConfigService.daemonLogPath()}`);
                    break;
                }
                }
            }
            resolve(exitCode);
        });
    });
}

/**
 * Takes a daemon exit code and connection metadata and returns an appropriate error log statement. Can be used
 * by connection handlers that receive a nonzero code.
 *
 * NOTE: If an error code is handled in this function, we should not log an error for it in {@link waitForDaemonProcessExit},
 *       but we should still catch it to avoid logging the default error.
 * @param exitCode should be a nonzero number
 * @param conn A {@link CreateUniversalConnectionResponse} that we can use to inform the user about the connection
 * @returns an error message to log
 */
export function handleExitCode(exitCode: number, conn: CreateUniversalConnectionResponse): string {
    switch (exitCode) {
    case DAEMON_EXIT_CODES.USER_NOT_FOUND: {
        return `Failed to connect: ${conn.targetUser} does not exist on ${conn.targetName}`;
    }
    case DAEMON_EXIT_CODES.POLICY_EDITED_DISCONNECT: {
        return `The policy allowing you access to ${conn.targetName} as ${conn.targetUser} was edited. You may no longer have access to ${conn.targetName}. To view which targets you have access to, try zli lt.`;
    }
    case DAEMON_EXIT_CODES.POLICY_DELETED_DISCONNECT: {
        return `The policy allowing you access to ${conn.targetName} as ${conn.targetUser} was deleted. If you had access through JIT, you will need to request JIT access again.`;
    }
    case DAEMON_EXIT_CODES.IDLE_TIMEOUT: {
        return `Connection to ${conn.targetName} closed because idle user timeout was reached.`;
    }
    default: {
        // if the code isn't recognized here, we already logged the general-purpose error message
        return '';
    }
    }
}