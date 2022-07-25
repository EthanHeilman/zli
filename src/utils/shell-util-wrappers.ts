import * as cp from 'child_process';

// These are wrapper functions we use in shell-utils that we can spy on or mock
// the implementation of during system-tests. If they are defined in the same
// module as shell-utils then they cannot be spy'd on with jest.
// https://stackoverflow.com/questions/45111198/how-to-mock-functions-in-the-same-module-using-jest

export function pushToStdOut(output: Uint8Array) {
    process.stdout.write(output);
}

export function pushToStdErr(output: Uint8Array) {
    process.stderr.write(output);
}

/**
 * spawns daemon as a subprocess with inherited stdio and returns a promise that
 * resolves when the daemon process exits with an exit code
 * @param path path to the daemon process
 * @param env environment key-value pairs
 * @param args args to pass to the daemon
 * @param cwd current working directory to use for the spawned subprocess
 * @returns A promise that resolves with the daemon process exit code
 */
export function spawnDaemon(path: string, args: string[], env: object, cwd: string): Promise<number> {
    return new Promise((resolve, reject) => {
        try {
            const options: cp.SpawnOptions = {
                cwd: cwd,
                env: { ...env, ...process.env },
                detached: true,
                shell: true,
                stdio: ['inherit', 'inherit', 'inherit'],
            };

            const daemonProcess = cp.spawn(path, args, options);

            daemonProcess.on('close', (exitCode) => {
                resolve(exitCode);
            });
        }
        catch (err) {
            reject(err);
        }
    });
}