import *  as fs from 'fs';

import { Reporter, Test } from '@jest/reporters';
import { TestCaseResult } from '@jest/test-result';
import { envMap } from '../cli-driver';
import { LoggerConfigService } from '../services/logger/logger-config.service';
import { Logger } from '../services/logger/logger.service';

const configName = envMap.configName;

// Setup services used for running system tests
export const loggerConfigService = new LoggerConfigService(configName, false, envMap.configDir);
export const logger = new Logger(loggerConfigService, false, false, true);

// Our reporter implements only the onRunComplete lifecycle
// function, run after all tests have completed
export default class CustomReporter implements Pick<Reporter, 'onTestCaseResult'> {

    async onTestCaseResult(test: Test, testCaseResult: TestCaseResult) {
        const testFailed = testCaseResult.status === 'failed';
        await this.checkDaemonLogs(!testFailed, testCaseResult.fullName);
    }

    /**
     * Helper function to clear daemon logs in-between tests and to print daemon
     * logs if a test failed
     * @param {boolean} testFailed Boolean to indicate if the test failed
     * @param {string} testName Test name to log incase of failure
     */
    async checkDaemonLogs(testFailed: boolean, testName: string) {
        const daemonLogPath = loggerConfigService.daemonLogPath();
        if (!fs.existsSync(daemonLogPath)) {
            if (!testFailed) {
                logger.warn(`No daemon logs found under ${daemonLogPath}. Skipping reporting daemon logs`);
            }
            return;
        };

        if (testFailed) {
            // Print the logs from the daemon
            try {
                const daemonLogs = fs.readFileSync(daemonLogPath, 'utf8');
                logger.error(`Test failed: ${testName}! Daemon logs:\n${daemonLogs}`);
            } catch (err) {
                logger.error(`Error reading logs from daemon log file: ${daemonLogPath}. Error: ${err}. Skipping reporting daemon logs`);
            }
        }

        // Always delete the daemon log file after each test
        try {
            fs.unlinkSync(daemonLogPath);
        } catch(err) {
            logger.error(`Error deleting daemon log file: ${daemonLogPath}. Error: ${err}`);
        }
    }
}

