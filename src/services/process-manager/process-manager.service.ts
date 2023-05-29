import got from 'got/dist/source';

import { KillProcessResultType } from 'services/process-manager/process-manager.service.types';
import * as cp from 'child_process';

/**
 * Helper service that provides functionality to safely shut down and check processes
 */
export class ProcessManagerService {
    constructor() { }

    /**
     * Attempts to shut down the process using the given controlPort
     *
     * Note that the given process is not guaranteed to exit within any set timeframe. If you need to wait for the
     * process to exit (for example, to free up a given port), use `await waitForProcess` after `killProcess`
     * @param controlPort
     */
    public async shutDownProcess(controlPort: number): Promise<void> {
        // The daemon's control API isn't exactly RESTful. 'Put' seems like the least inappropriate verb for an idempotent operation
        await got.put(`http://localhost:${controlPort}/shutdown`);
    }

    /**
     * Kill a process by PID. Throws an error if killing the process failed.
     *
     * If there is no process running with PID, this is a no-op
     * @param pid Process's PID
     * @param hard if true, uses the uncatchable SIGKILL; if false, uses a catchable SIGINT
     * @returns True if the process was killed. False if there is no such process running.
     */
    public killProcess(pid: number): boolean {
        // this is safe even if the process doesn't exist
        if (process.platform === 'win32') {
            cp.spawnSync('taskkill', ['/pid', pid.toString(), '/f', '/t']);
            return true;
        }

        // For Unix we kill all processes based on group id by using `kill -9 -$PID`
        // "Please note [the dash] before pid. This converts a pid to a group of pids for process kill() method."
        // https://stackoverflow.com/a/49842576/9186330
        // https://azimi.me/2014/12/31/kill-child_process-node-js.html
        try {
            process.kill(-pid, 'SIGKILL');
            return true;
        } catch (err) {
            // we failed to kill because there is no such process
            if (err.code === 'ESRCH') {
                return false;
            } else {
                // we failed for some other reason; let the caller know
                throw err;
            }
        }
    }

    /**
     * Check if a process is running
     * @param pid Process's PID to check
     * @returns True if the process is still running. False otherwise
     */
    public isProcessRunning(pid: number): boolean {
        try {
            // by some miracle, this is cross-platform
            return process.kill(pid, 0);
        } catch (e) {
            // generally, if the above command fails, that means the process is dead (e.g. ESRCH).
            // EPERM is the only exception: if we get a permission error, the process must be alive
            return e.code === 'EPERM';
        }
    }

    /**
     * Block until a given process is no longer running, or for the length of the timeout. Suitable for use with general OS processes.
     * To wait for a daemon child process started in the current execution, use daemon-utils.ts:`waitForDaemonProcessExit`
     * @param pid Process's PID to wait for
     * @param timeout The maximum time (in ms) to wait
     */
    public async waitForProcess(pid: number, timeout: number = 10000) {
        let done = false;
        const globalTimeout = new Promise<void>(async (_, reject) => {
            await new Promise(r => setTimeout(r, timeout));
            const err = new Error(`process is still running after ${timeout} ms`);
            err.name = 'TIMEOUT';
            done = true;
            reject(err);
        });

        const processDone = new Promise<void>(async (resolve, _) => {
            while (this.isProcessRunning(pid) && !done) {
                // wait half a second and check again
                await new Promise(r => setTimeout(r, 500));
            }
            done = true;
            resolve();
        });

        return Promise.race([globalTimeout, processDone]);
    }

    /**
    * Attempts to kill process gracefully by sending a request to its control server. Waits for the provided
    * timeout If the timeout is reached and the process still exists, kills it forcefully.
    * @param {number} controlPort Where the daemon is listening for control messages
    * @param {number} localPid Local pid we are trying to kill
    * @param {number} timeout The maximum time (in ms) to wait
    * @returns Result of killing the process
    */
    public async tryShutDownProcess(controlPort: number, localPid: number, timeout: number = 15000): Promise<KillProcessResultType> {
        try {
            // First try to shut down the process gracefully
            await this.shutDownProcess(controlPort);
            await this.waitForProcess(localPid, timeout);
            return 'killed_gracefully';
        } catch (err: any) {
            if (err.name === 'TIMEOUT' || err.code === 'ECONNREFUSED' || err.code === 'ERR_GOT_REQUEST_ERROR') {
                // Attempt force kill
                const killed = this.killProcess(localPid);
                return killed ? 'killed_forcefully' : 'no_longer_exists';
            } else {
                // Unknown error
                throw err;
            }
        }
    }
}