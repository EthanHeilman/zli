import { CliDriver } from '../../../cli-driver';

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
