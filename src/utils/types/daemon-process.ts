import { ChildProcess } from 'child_process';

// used to manage ephemeral connections (shell and ssh)
export interface DaemonProcess {
    process: ChildProcess
    pid: number
    controlPort: number
}