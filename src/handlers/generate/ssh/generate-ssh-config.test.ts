import fs from 'fs';
import path from 'path';
import mockArgv from 'mock-argv';
import * as SshConfigMocks from 'handlers/generate/ssh/generate-ssh-config.mock';
import { PolicyQueryHttpService } from 'http-services/policy-query/policy-query.http-services';
import { CliDriver } from 'cli-driver';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { createTempDirectory, deleteDirectory, mockShellAuthDetails, mockUniversalConnectionRequest, mockUniversalConnectionResponse, unitTestMockSetup } from 'utils/unit-test-utils';
import * as CleanExitHandler from 'handlers/clean-exit.handler';
import * as shellConnectHandler from 'handlers/connect/shell-connect.handler';
import * as ShellUtils from 'utils/shell-utils';

describe('Generate ssh config suite', () => {
    const originalPath: string = (process.platform === 'win32') ? process.env.HOMEPATH : process.env.HOME;
    const tempDir = path.join(__dirname, 'temp-generate-ssh-config-test');

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(true);
        SshConfigMocks.sshConfigMockSetup();

        // Set HOME dir to point to our temp dir
        if (process.platform === 'win32')
            process.env.HOMEPATH = path.join(__dirname, 'temp-generate-ssh-config-test');
        else
            process.env.HOME = path.join(__dirname, 'temp-generate-ssh-config-test');
    });

    afterEach(async () => {
        jest.resetAllMocks();
        // Call zli configure to clear the local default user
        await mockArgv(['configure', 'default-targetuser', '--reset'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });
    });

    afterAll( () => {
        // Reset HOME dir and delete temp dir
        if (process.platform === 'win32')
            process.env.HOMEPATH = originalPath;
        else
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
        let userConfigFileContents = fs.readFileSync(expectedUserConfigPath, 'utf8');
        let bzConfigFileContents = fs.readFileSync(expectedBzConfigPath, 'utf8');

        // Expected user ssh config file
        const mockUserSshConfigContents = SshConfigMocks.getMockSshConfigContents(false);
        expect(bzConfigFileContents).toEqual(SshConfigMocks.mockBzSshConfigContents);
        expect(userConfigFileContents).toEqual(mockUserSshConfigContents);

        /*
            Next check that we can delete the bz file that was created
            and remove related contents from user config file
            when there the user no longer has access to anything
        */
        jest.spyOn(PolicyQueryHttpService.prototype, 'GetSshTargets').mockImplementationOnce(async () => []);
        // Call the function
        await mockArgv(['generate', 'sshConfig'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Expect the flattened file after being updated
        userConfigFileContents = fs.readFileSync(expectedUserConfigPath, 'utf8');
        let bzConfigFileErrorCode;
        try {
            bzConfigFileContents = fs.readFileSync(expectedBzConfigPath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                bzConfigFileErrorCode = err.code;
            }
        }

        // Expected bz config file to not exist
        expect(bzConfigFileErrorCode).toEqual('ENOENT');
        // Expect the intro and include statments to be removed
        // Which leaves nothing in the test user config file
        expect(userConfigFileContents).toEqual('');
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

    test('284823: Generate ssh config with default user', async () => {
        // Create temp test dir and files to write to
        const defaultDir = path.join(tempDir, '.ssh');
        const expectedUserConfigPath = path.join(defaultDir, 'config');
        const expectedBzConfigPath = path.join(defaultDir, 'test-config-bzero-bz-config');
        createTempDirectory(defaultDir, [expectedUserConfigPath, expectedBzConfigPath], ['', '']);

        // Call zli configure to set the local default user
        await mockArgv(['configure', 'default-targetuser', 'default-user'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Call the function
        await mockArgv(['generate', 'sshConfig'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Read the bz config file
        const bzConfigFileContents = fs.readFileSync(expectedBzConfigPath, 'utf8');
        // Expect the default user to be overwritten as the user
        expect(bzConfigFileContents).toEqual(SshConfigMocks.mockBzSshConfigContentsDefaultUser);
    });
});

// Moving this test suite here since both ssh and connect read/write default user to same file
// Tests across different files are run in parallel which causes a race condition
describe('Connect suite', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(false);
    });

    afterEach(async () => {
        jest.resetAllMocks();
        // Call zli configure to clear the local default user
        await mockArgv(['configure', 'default-targetuser', '--reset'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });
    });

    // This unit test will assert on the request being sent to the universal controller
    // This unit test covers default user and environment features
    test('290387: Open connection to a Bzero target', async () => {
        // Mock our services
        const getUniversalConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateUniversalConnection').mockImplementation(async () => mockUniversalConnectionResponse);
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.resolve());
        jest.spyOn(shellConnectHandler, 'shellConnectHandler');
        jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails').mockImplementation(async () => mockShellAuthDetails);
        jest.spyOn(ShellUtils, 'startShellDaemon').mockImplementation(async () => Promise.reject(1));
        jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.resolve());

        // Call zli configure to set the local default user
        await mockArgv(['configure', 'default-targetuser', 'ec2-user'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Call the function
        let err = undefined;
        try {
            await mockArgv(['connect', 'bzero-ec2-test.1e8e28fa-6e6b-4fc0-8994-38d69d987978', '--targetType=bzero'], async () => {
                const driver = new CliDriver();
                await driver.run(process.argv.slice(2), true);
            });
        } catch (e: any) {
            err = e;
        }
        expect(err).toBeUndefined();
        expect(cleanExitSpy).toHaveBeenCalled();

        // Assert that the getUniversalConnectionSpy was called with mockUniversalConnectionRequest
        /*  targetId: undefined,
            targetName: 'bzero-ec2-test1',
            envId: '1e8e28fa-6e6b-4fc0-8994-38d69d987978',
            envName: undefined,
            targetUser: 'ec2-user',
            targetGroups: undefined,
            targetType: TargetType.Bzero*/
        expect(getUniversalConnectionSpy).toHaveBeenCalledWith(mockUniversalConnectionRequest);
    });
});