import path from 'path';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { ConfigService } from '../../services/config/config.service';
import { mockTunnelsResponseList } from '../../utils/unit-test-utils';
import * as middlewareHandler from '../middleware.handler';

export function sshConfigMockSetup(): void {
    jest.spyOn(middlewareHandler, 'fetchDataMiddleware').mockImplementationOnce(() => {
        return {
            dynamicConfigs: Promise.resolve([]),
            ssmTargets: Promise.resolve([]),
            clusterTargets: Promise.resolve([]),
            bzeroTargets: Promise.resolve([]),
            envs: Promise.resolve([]),
        };
    });
    // Mock GetTunnels from PolicyQueryHttpService
    jest.spyOn(PolicyQueryHttpService.prototype, 'GetSshTargets').mockImplementation(async () => mockTunnelsResponseList);
    // Mock Config methods used in building ssh config file
    jest.spyOn(ConfigService.prototype, 'getConfigName').mockImplementation(() => 'test-config');
    jest.spyOn(ConfigService.prototype, 'sshKeyPath').mockImplementation(() => '/test/sshKeyPath');
    jest.spyOn(ConfigService.prototype, 'sshKnownHostsPath').mockImplementation(() => '/test/knownHosts');
}

// Expected BZ config file
export const mockBzSshConfigContents: string = `
Host test-target-name
    IdentityFile /test/sshKeyPath
    UserKnownHostsFile /test/knownHosts
    ProxyCommand npm run start ssh-proxy --configName=test-config -s test-config-bzero-%n %r %p /test/sshKeyPath
    User test-user

Host test-config-bzero-*
    IdentityFile /test/sshKeyPath
    UserKnownHostsFile /test/knownHosts
    ProxyCommand npm run start ssh-proxy --configName=test-config -s %n %r %p /test/sshKeyPath
`;

/**
 * This helper function mocks user SSH config files when not supplying and supplying their own bzSshPath, respectively
 * @param withBzSshPathOption Boolean signifying if the option --bzSshPath was used
 */
export function getMockSshConfigContents(withBzSshPathOption: boolean): string {
    const tempDir = (!withBzSshPathOption) ? path.join(__dirname, 'temp-generate-ssh-config-test', '.ssh') : path.join(__dirname, 'temp-generate-ssh-config-test');

    // Default config path
    const expectedBzConfigPathDefault = path.join(tempDir, 'test-config-bzero-bz-config');

    // Config path supplied by user
    const expectedBzConfigPathPassedByUser = path.join(tempDir, 'bzSshPath');

    return `Include ${(!withBzSshPathOption) ? expectedBzConfigPathDefault : expectedBzConfigPathPassedByUser}\n\n`;
}