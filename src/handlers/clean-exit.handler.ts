import { ILogger } from 'webshell-common-ts/logging/logging.types';

export interface IExitableLogger extends ILogger {
    flushLogs(): Promise<void>;
    logGAError(): Promise<void>;
}

export async function cleanExit(exitCode: number, logger: IExitableLogger) {
    await logger.flushLogs();

    if (exitCode != 0) {
        // If we have a non-zero exit code report that back to GA
        await logger.logGAError();
    }
    process.exit(exitCode);
}