import mockArgv from 'mock-argv';
import { CliDriver } from '../../../cli-driver';
import { cleanConsoleLog, unitTestMockSetup } from '../../../utils/unit-test-utils';
import { Logger } from '../../../services/logger/logger.service';
import * as SshProxyMocks from './generate-ssh-proxy.mock';

describe('Generate ssh proxy suite', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(true);
        SshProxyMocks.sshProxyMockSetup();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    test('31665: Generate ssh proxy', async () => {
        // Listen to our generate ssh proxy response
        const loggerSpy = jest.spyOn(Logger.prototype, 'info');

        // Call the function
        await mockArgv(['generate', 'ssh-proxy'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const expectedSshProxyOutput = `
Add the following lines to your ssh config (~/.ssh/config) file:

Host test-config-bzero-*
  IdentityFile /test/sshKeyPath
  UserKnownHostsFile /test/knownHosts
  ProxyCommand npm run start ssh-proxy --configName=test-config -s %n %r %p /test/sshKeyPath

Then you can use native ssh to connect to any of your ssm targets using the following syntax:

ssh <user>@test-config-bzero-<ssm-target-id-or-name>
`;
        const outputArgs = loggerSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(expectedSshProxyOutput);
    });
});