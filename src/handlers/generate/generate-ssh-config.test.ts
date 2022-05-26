import fs from 'fs';
import path from 'path';
import mockArgv from 'mock-argv';
import { CliDriver } from '../../cli-driver';
import { createTempDirectory, deleteDirectory, unitTestMockSetup } from '../../utils/unit-test-utils';
import * as SshConfigMocks from './generate-ssh-config.mock';

describe('Generate ssh config suite', () => {
    const originalPath: string = process.env.HOME;
    const tempDir = path.join(__dirname, 'temp-generate-ssh-config-test');

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(true);
        SshConfigMocks.sshConfigMockSetup();

        // Set HOME dir to point to our temp dir
        process.env.HOME = path.join(__dirname, 'temp-generate-ssh-config-test');
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    afterAll( () => {
        // Reset HOME dir and delete temp dir
        process.env.HOME = originalPath;
        deleteDirectory(tempDir);
    });

    test('31663: Generate ssh config', async () => {
        // Create temp test dir and files to write to
        const defaultDir = path.join(tempDir, '.ssh');
        const expectedUserConfigPath = path.join(defaultDir, 'config');
        const expectedBzConfigPath = path.join(defaultDir, 'test-config-bzero-bz-config');
        createTempDirectory(defaultDir, [expectedUserConfigPath, expectedBzConfigPath], ['', '']);

        // Call the function
        await mockArgv(['generate', 'sshConfig'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Expect the flattened file after being updated
        const userConfigFileContents = fs.readFileSync(expectedUserConfigPath, 'utf8');
        const bzConfigFileContents = fs.readFileSync(expectedBzConfigPath, 'utf8');

        // Expected user ssh config file
        const mockUserSshConfigContents = SshConfigMocks.getMockSshConfigContents(false);
        expect(bzConfigFileContents).toEqual(SshConfigMocks.mockBzSshConfigContents);
        expect(userConfigFileContents).toEqual(mockUserSshConfigContents);
    });

    test('31664: Generate ssh config with --mySshPath and --bzSshPath', async () => {
        // Create temp test dir and files to write to
        const expectedUserConfigPath = path.join(tempDir, 'mySshPath');
        const expectedBzConfigPath = path.join(tempDir, 'bzSshPath');
        createTempDirectory(tempDir, [expectedUserConfigPath, expectedBzConfigPath], ['', '']);

        // Call the function
        await mockArgv(['generate', 'sshConfig', `--mySshPath=${expectedUserConfigPath}`, `--bzSshPath=${expectedBzConfigPath}`], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const userConfigFileContents = fs.readFileSync(expectedUserConfigPath, 'utf8');
        const bzConfigFileContents = fs.readFileSync(expectedBzConfigPath, 'utf8');
        // Expected user ssh config file
        const mockUserSshConfigContents = SshConfigMocks.getMockSshConfigContents(true);
        expect(bzConfigFileContents).toEqual(SshConfigMocks.mockBzSshConfigContents);
        expect(userConfigFileContents).toEqual(mockUserSshConfigContents);
    });
});