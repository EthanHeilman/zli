import fs from 'fs';
import mockArgv from 'mock-argv';
import path from 'path';
import { CliDriver } from '../../cli-driver';
import { ConfigService } from '../../services/config/config.service';
import { cleanConsoleLog, createTempDirectory, deleteDirectory, unitTestMockSetup } from '../../utils/unit-test-utils';
import * as CleanExitHandler from '../clean-exit.handler';
import * as DaemonUtils from '../../utils/daemon-utils';
import * as KubeConfigMocks from './generate-kube-config.mock';

describe('Generate kube config suite', () => {
    // Temp directory to write files to
    const tempDir = path.join(__dirname, 'temp-kube-config-test');

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(false);
        KubeConfigMocks.kubeConfigMockSetup();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    afterAll(() => {
        deleteDirectory(tempDir);
    });

    test('31623: Generate kube config', async () => {
        // Create a deep copy to allow keyPath to be null
        const testMockKubeConfig = JSON.parse(JSON.stringify(KubeConfigMocks.mockKubeConfig));
        testMockKubeConfig['keyPath'] = null;
        jest.spyOn(ConfigService.prototype, 'getKubeConfig').mockImplementation(() => testMockKubeConfig);

        // Listen to our generate kube config response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['generate', 'kubeConfig'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(KubeConfigMocks.mockKubeConfigOutput);
    });

    test('31624: Generate kube config with --update option', async () => {
        // Mock kube config data
        jest.spyOn(ConfigService.prototype, 'getKubeConfig').mockImplementation(() => KubeConfigMocks.mockKubeConfig);

        // Create temp directory and testFile to update
        const testFile = path.join(tempDir, 'test-config');
        createTempDirectory(tempDir, [testFile], [KubeConfigMocks.mockConfigBeforeUpdate]);

        // Change KUBECONFIG path to point to testFile
        const originalKubeConfig = process.env.KUBECONFIG;
        process.env.KUBECONFIG = testFile;

        // Call the function
        await mockArgv(['generate', 'kubeConfig', '--update'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Expect the flattened file after being updated
        const updatedFile = fs.readFileSync(testFile, 'utf8');
        expect(updatedFile).toEqual(KubeConfigMocks.mockConfigAfterUpdate);
        process.env.KUBECONFIG = originalKubeConfig;
    });

    test('31625: Generate kube config with --customPort option', async () => {
        // Create a deep copy to allow keyPath to be null
        const testMockKubeConfig = JSON.parse(JSON.stringify(KubeConfigMocks.mockKubeConfig));
        testMockKubeConfig['keyPath'] = null;
        jest.spyOn(ConfigService.prototype, 'getKubeConfig').mockImplementation(() => testMockKubeConfig);

        // Listen to our generate kube config response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['generate', 'kubeConfig', '--customPort=5000'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(KubeConfigMocks.mockKubeConfigCustomPortOutput);
    });

    test('31626: Generate kube config with --outputFile option', async () => {
        // Mock kube config data
        jest.spyOn(ConfigService.prototype, 'getKubeConfig').mockImplementation(() => KubeConfigMocks.mockKubeConfig);

        // Create temp dir and outputFile to write to
        const outputFile = path.join(tempDir, 'test-file');
        createTempDirectory(tempDir, [outputFile], ['']);

        // Call the function
        await mockArgv(['generate', 'kubeConfig', `--outputFile=${outputFile}`], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputFileContents = fs.readFileSync(outputFile, 'utf8');
        expect(outputFileContents).toEqual(KubeConfigMocks.mockKubeConfigOutput);
    });

    test('31627: Error upon generating a new kube config', async () => {
        // Create a deep copy to allow keyPath to be null
        const testMockKubeConfig = JSON.parse(JSON.stringify(KubeConfigMocks.mockKubeConfig));
        testMockKubeConfig['keyPath'] = null;
        jest.spyOn(ConfigService.prototype, 'getKubeConfig').mockImplementation(() => testMockKubeConfig);

        // Fail upon generating new cert
        jest.spyOn(DaemonUtils, 'generateNewCert').mockImplementation(async () => Promise.reject());

        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.reject(Error('some-err')));

        // Call the function
        let err = undefined;
        try {
            await mockArgv(['generate', 'kubeConfig'], async () => {
                const driver = new CliDriver();
                await driver.run(process.argv.slice(2), true);
            });
        } catch (e) {
            err = e;
        }

        expect(err).toBeDefined();
        expect(cleanExitSpy).toHaveBeenCalledTimes(2);
        expect(cleanExitSpy).toHaveBeenCalledWith(1, expect.anything());
    });

    test('31628: Error updating existing kube config', async () => {
        // Mock kube config data
        jest.spyOn(ConfigService.prototype, 'getKubeConfig').mockImplementation(() => KubeConfigMocks.mockKubeConfig);

        // Nonexistent path causing error when attempting to write config to KUBECONFIG
        const originalKubeConfig = process.env.KUBECONFIG;
        process.env.KUBECONFIG = 'test/kube/config/faulty/path';

        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.reject(Error('some-err')));

        // Call the function
        let err = undefined;
        try {
            await mockArgv(['generate', 'kubeConfig', '--update'], async () => {
                const driver = new CliDriver();
                await driver.run(process.argv.slice(2), true);
            });
        } catch (e) {
            err = e;
        }

        expect(err).toBeDefined();
        expect(cleanExitSpy).toHaveBeenCalledTimes(3);
        expect(cleanExitSpy).toHaveBeenNthCalledWith(3, 1, expect.anything());
        process.env.KUBECONFIG = originalKubeConfig;
    });
});