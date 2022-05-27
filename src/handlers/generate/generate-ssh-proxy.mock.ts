import { ConfigService } from '../../services/config/config.service';
import * as middlewareHandler from '../middleware.handler';

export function sshProxyMockSetup(): void {
    jest.spyOn(middlewareHandler, 'fetchDataMiddleware').mockImplementationOnce(() => {
        return {
            dynamicConfigs: Promise.resolve([]),
            ssmTargets: Promise.resolve([]),
            clusterTargets: Promise.resolve([]),
            bzeroTargets:  Promise.resolve([]),
            envs: Promise.resolve([]),
        };
    });
    // Mock Config methods used in building ssh config file
    jest.spyOn(ConfigService.prototype, 'getConfigName').mockImplementation(() => 'test-config');
    jest.spyOn(ConfigService.prototype, 'sshKeyPath').mockImplementation(() => '/test/sshKeyPath');
}