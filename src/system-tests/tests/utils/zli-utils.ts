import { CliDriver } from '../../../cli-driver';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';

export async function callZli(zliArgs: string[], expectedExitCode: number = 0, callback?: (err: Error, argv: any, output: string) => Promise<void>): Promise<void> {
    // Spy on calls to cleanExit but dont call process.exit. Still throw an
    // exception if exitCode != 0 which will fail the test
    jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async (exitCode) => {
        if (exitCode !== expectedExitCode) {
            throw new Error(`cleanExit was called with exitCode == ${exitCode}`);
        }
    });

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
                    if (err && expectedExitCode == 0) {
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
