import fs from 'fs';
import path from 'path';
import mockArgv from 'mock-argv';
import { CliDriver } from 'cli-driver';
import { cleanConsoleLog, createTempDirectory, deleteDirectory, mockEnv, mockScript, mockScriptResponse, unitTestMockSetup } from 'utils/unit-test-utils';
import { ScriptTargetNameOption } from 'webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import * as BashMockSetup from 'handlers/generate/autodiscovery/generate-bash.mock';
import { AutoDiscoveryScriptHttpService } from 'http-services/auto-discovery-script/auto-discovery-script.http-services';

describe('Generate Bash suite', () => {
    let autoDiscoveryScriptHttpServiceSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;
    // For --outputFile
    const tempDir = path.join(__dirname, 'temp-bash-test');

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(true);
        BashMockSetup.bashMockSetup();

        autoDiscoveryScriptHttpServiceSpy = jest.spyOn(AutoDiscoveryScriptHttpService.prototype, 'GetBashAutodiscoveryScript').mockImplementation(async () => mockScriptResponse);
        logSpy = jest.spyOn(console, 'log');
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    afterAll(() => {
        deleteDirectory(tempDir);
    });

    test('31615: Generate bash script', async () => {
        // Call the function
        await mockArgv(['generate', 'bash'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(mockScript);
        // Expect default parameters when not specified
        expect(autoDiscoveryScriptHttpServiceSpy).toHaveBeenCalledWith(ScriptTargetNameOption.BashHostName, mockEnv.id, false);
    });

    test('31616: Generate bash script when targetNameScheme is do', async () => {
        // Call the function
        await mockArgv(['generate', 'bash', '--targetNameScheme=do'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(mockScript);
        expect(autoDiscoveryScriptHttpServiceSpy).toHaveBeenCalledWith(ScriptTargetNameOption.DigitalOceanMetadata, expect.anything(), expect.anything());
    });

    test('31617: Generate bash script when targetNameScheme is aws', async () => {
        // Call the function
        await mockArgv(['generate', 'bash', '--targetNameScheme=aws'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(mockScript);
        expect(autoDiscoveryScriptHttpServiceSpy).toHaveBeenCalledWith(ScriptTargetNameOption.AwsEc2Metadata, expect.anything(), expect.anything());
    });

    test('31618: Generate bash script when targetNameScheme is time', async () => {
        // Call the function
        await mockArgv(['generate', 'bash', '--targetNameScheme=time'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(mockScript);
        expect(autoDiscoveryScriptHttpServiceSpy).toHaveBeenCalledWith(ScriptTargetNameOption.Timestamp, expect.anything(), expect.anything());
    });

    test('31619: Generate bash script when targetNameScheme is hostname', async () => {
        // Call the function
        await mockArgv(['generate', 'bash', '--targetNameScheme=hostname'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(mockScript);
        expect(autoDiscoveryScriptHttpServiceSpy).toHaveBeenCalledWith(ScriptTargetNameOption.BashHostName, expect.anything(), expect.anything());
    });

    test('31620: Generate bash script with -o option', async () => {
        // Create temp dir with output file to write to
        const outputFile = path.join(tempDir, 'test-file');
        createTempDirectory(tempDir, [outputFile], ['']);

        // Call the function
        await mockArgv(['generate', 'bash', `-o=${outputFile}`], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputFileContents = fs.readFileSync(outputFile, 'utf8');
        expect(outputFileContents).toEqual(mockScript);
    });

    test('31621: Generate bash script with -e option', async () => {
        // Call the function
        await mockArgv(['generate', 'bash', '-e=test-env-name'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(mockScript);
        expect(autoDiscoveryScriptHttpServiceSpy).toHaveBeenCalledWith(ScriptTargetNameOption.BashHostName, mockEnv.id, expect.anything());
    });
});