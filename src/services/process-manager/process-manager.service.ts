/**
 * Helper service that provides functionality to kill a process and check if a
 * process is running
 */
export class ProcessManagerService {
    constructor() {}

    /**
     * Kill a process by PID. Throws an error if killing the process failed.
     * Note that because `killPid` sends SIGINT instead of SIGKILL, the given process is not guaranteed to exit within any set timeframe.
     * If you need to wait for the process to exit (for example, to free up a given port), use `await waitForProcess` after `killProcess`
     *
     * If there is no process running with PID, this is a no-op
     * @param pid Process's PID
     * @returns True if the process was killed. False if there is no such process running.
     */
    public killProcess(pid: number): boolean {
        // For Unix we kill all processes based on group id by using `kill -2 -$PID`
        // "Please note [the dash] before pid. This converts a pid to a group of pids for process kill() method."
        // https://stackoverflow.com/a/49842576/9186330
        // https://azimi.me/2014/12/31/kill-child_process-node-js.html
        try {
            process.kill(-pid, 'SIGINT');
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
}