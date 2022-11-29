import { makeCaseInsensitive } from '../../../utils/utils';
import { CliDriver } from '../../../cli-driver';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';

export async function callZli(zliArgs: string[], callback?: (err: Error, argv: any, output: string) => Promise<void>): Promise<void> {
    const cliDriver = new CliDriver();
    const { baseCmd, parsedArgv } = makeCaseInsensitive(cliDriver.availableCommands, zliArgs);
    await cliDriver.getCliDriver(true, baseCmd).parseAsync(parsedArgv, {}, callback);
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