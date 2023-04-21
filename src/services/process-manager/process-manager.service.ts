import { KillProcessResultType } from './process-manager.service.types';

/**
 * Helper service that provides functionality to safely kill and check processes
 */
export class ProcessManagerService {
    constructor() { }

    /**
     * Kill a process by PID. Throws an error if killing the process failed.
     * Note that because `killPid` sends SIGINT instead of SIGKILL, the given process is not guaranteed to exit within any set timeframe.
     * If you need to wait for the process to exit (for example, to free up a given port), use `await waitForProcess` after `killProcess`
     *
     * If there is no process running with PID, this is a no-op
     * @param pid Process's PID
     * @param hard if true, uses the uncatchable SIGKILL; if false, uses a catchable SIGINT
     * @returns True if the process was killed. False if there is no such process running.
     */
    public killProcess(pid: number, hard: boolean = false): boolean {
        // For Unix we kill all processes based on group id by using `kill -2 -$PID`
        // "Please note [the dash] before pid. This converts a pid to a group of pids for process kill() method."
        // https://stackoverflow.com/a/49842576/9186330
        // https://azimi.me/2014/12/31/kill-child_process-node-js.html
        try {
            process.kill(-pid, hard ? 'SIGKILL' : 'SIGINT');
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
            return process.kill(pid, 0);
        }
        catch (e) {
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
    * Atttempt to kill process with provided localPid. First, we try to kill the
    * process gracefully by waiting for the provided timeout. If the timeout is
    * reached, we attempt to kill the process forcefully if it still exists.
    * @param {number} localPid Local pid we are trying to kill
    * @param {number} timeout The maximum time (in ms) to wait
    * @returns Result of killing the process
    */
    public async tryKillProcess(localPid: number, timeout: number = 15000): Promise<KillProcessResultType> {
        try {
            // First try to interrupt the process gracefully
            this.killProcess(localPid, false);
            await this.waitForProcess(localPid, timeout);
            return 'killed_gracefully';
        } catch (err: any) {
            if (err.name === 'TIMEOUT') {
                // Attempt force kill
                const killed = this.killProcess(localPid, true);
                return killed ? 'killed_forcefully' : 'no_longer_exists';
            } else {
                // Unknown error
                throw err;
            }
        }
    }
}