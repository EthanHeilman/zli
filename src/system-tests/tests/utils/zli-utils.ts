import { CliDriver } from '../../../cli-driver';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';

export async function callZli(zliArgs: string[], callback?: (err: Error, argv: any, output: string) => Promise<void>): Promise<void> {
    const cliDriver = new CliDriver();
    const callbackComplete = new Promise<void>(async (res, rej) => {
        try {
            await cliDriver.run(zliArgs, true, async (err, argv, output) => {
                try {
                    // Allow test code to handle err, argv, and output with
                    // custom logic
                    if (callback)
                        await callback(err, argv, output);

                    // Always throw an error to fail the test if yargs returned
                    // an error if the expected exit code is 0
                    if (err) {
                        throw new Error(`zli ${zliArgs.join(' ')} returned error: ${err}`);
                    }

                    res();
                } catch (e) {
                    rej(e);
                }
            });
        } catch (e) {
            rej(e);
        }
    });

    await callbackComplete;
}

/**
 * Mocks the cleanExit function to just throw an error if exit code is non-zero
 * instead of calling process.exit(). This is needed in system tests because
 * otherwise a process.exit() call will kill the jest system test process
 * abruptly instead of just failing a single test.
 */
export async function mockCleanExit() {
    jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async (exitCode) => {
        if (exitCode !== 0) {
            throw new Error(`cleanExit was called with exitCode == ${exitCode}`);
        }
    });
}
