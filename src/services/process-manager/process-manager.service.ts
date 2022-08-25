import { killPid } from '../../utils/daemon-utils';
import isRunning from 'is-running';

/**
 * Helper service that provides functionality to kill a process and check if a
 * process is running
 */
export class ProcessManagerService {
    constructor() {}

    /**
     * Kill a process by PID. Throws an error if killing the process failed.
     * @param pid Process's PID
     */
    public killProcess(pid: number): void {
        killPid(pid.toString());
    }

    /**
     * Check if a process is running
     * @param pid Process's PID to check
     * @returns True if the process is still running. False otherwise
     */
    public isProcessRunning(pid: number): boolean {
        return isRunning(pid);
    }
}