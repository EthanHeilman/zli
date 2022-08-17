import { ConfigService } from '../../services/config/config.service';

export function sshProxyMockSetup(): void {
    // Mock Config methods used in building ssh config file
    jest.spyOn(ConfigService.prototype, 'getConfigName').mockImplementation(() => 'test-config');
    jest.spyOn(ConfigService.prototype, 'sshKeyPath').mockImplementation(() => '/test/sshKeyPath');
    jest.spyOn(ConfigService.prototype, 'sshKnownHostsPath').mockImplementation(() => '/test/knownHosts');
}