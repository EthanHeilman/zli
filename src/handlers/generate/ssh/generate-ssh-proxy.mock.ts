import path from 'path';
import os from 'os';
import { ConfigService } from '../../../services/config/config.service';

export const testConfigName = 'test-config';
export const sshKeyPath = path.join(os.tmpdir(), 'sshKeyPath');
export const sshKnownHosts = path.join(os.tmpdir(), 'knownHosts');

export function sshProxyMockSetup(): void {
    // Mock Config methods used in building ssh config file
    jest.spyOn(ConfigService.prototype, 'getConfigName').mockImplementation(() => testConfigName);
    jest.spyOn(ConfigService.prototype, 'getSshKeyPath').mockImplementation(() => sshKeyPath);
    jest.spyOn(ConfigService.prototype, 'getSshKnownHostsPath').mockImplementation(() => sshKnownHosts);
}