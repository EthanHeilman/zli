import { ConfigService } from '../../services/config/config.service';
import { mockEnvList } from '../../utils/unit-test-utils';
import { KubeConfig } from '../../utils/kubernetes.utils';
import * as middlewareHandler from '../middleware.handler';
import * as DaemonUtils from '../../utils/daemon-utils';
import * as KubeConfigHandler from './generate-kube-config.handler';

export function kubeConfigMockSetup() {
    jest.spyOn(middlewareHandler, 'fetchDataMiddleware').mockImplementationOnce(() => {
        return {
            dynamicConfigs: Promise.resolve([]),
            ssmTargets: Promise.resolve([]),
            clusterTargets: Promise.resolve([]),
            bzeroTargets:  Promise.resolve([]),
            envs: Promise.resolve(mockEnvList),
        };
    });

    // Mock Config methods used in building kube config file
    jest.spyOn(ConfigService.prototype, 'getConfigName').mockImplementation(() => 'test-config');
    jest.spyOn(ConfigService.prototype, 'configPath').mockImplementation(() => '/test/configPath');

    // Mocks to be called within generateKubeConfigHandler
    jest.spyOn(DaemonUtils, 'generateNewCert').mockImplementation(async () => Promise.resolve(['pathToKey', 'pathToCert', 'pathToCsr']));
    jest.spyOn(KubeConfigHandler, 'findPort').mockImplementation(() => 1);
    jest.spyOn(KubeConfigHandler.randtoken, 'generate').mockImplementation(() => '1');
}

export const mockKubeConfig: KubeConfig = {
    keyPath: 'pathToKey',
    certPath: 'pathToCert',
    csrPath: 'pathToCsr',
    token: '1',
    localHost: 'localhost',
    localPort: 1,
    localPid: null,
    targetUser: null,
    targetGroups: null,
    targetCluster: null,
    defaultTargetGroups: null
};

export const mockKubeConfigOutput: string =`
apiVersion: v1
clusters:
- cluster:
    server: https://localhost:1
    insecure-skip-tls-verify: true
  name: bctl-agent
contexts:
- context:
    cluster: bctl-agent
    user: test-email
  name: bzero-context
current-context: bzero-context
preferences: {}
users:
  - name: test-email
    user:
      token: "1"
`;

export const mockConfigBeforeUpdate: string = `
apiVersion: v1
clusters:
- cluster:
    server: https://localhost:0
    insecure-skip-tls-verify: true
  name: before-update
contexts:
- context:
    cluster: before-update
    user: test-email-0
  name: bzero-context-0
current-context: bzero-context
preferences: {}
users:
  - name: test-email-0
    user:
      token: "0"
`;

export const mockConfigAfterUpdate = `apiVersion: v1
clusters:
- cluster:
    insecure-skip-tls-verify: true
    server: https://localhost:1
  name: bctl-agent
- cluster:
    insecure-skip-tls-verify: true
    server: https://localhost:0
  name: before-update
contexts:
- context:
    cluster: bctl-agent
    user: test-email
  name: bzero-context
- context:
    cluster: before-update
    user: test-email-0
  name: bzero-context-0
current-context: bzero-context
kind: Config
preferences: {}
users:
- name: test-email
  user:
    token: "1"
- name: test-email-0
  user:
    token: "0"\n`;

export const mockKubeConfigCustomPortOutput: string =`
apiVersion: v1
clusters:
- cluster:
    server: https://localhost:5000
    insecure-skip-tls-verify: true
  name: bctl-agent
contexts:
- context:
    cluster: bctl-agent
    user: test-email
  name: bzero-context
current-context: bzero-context
preferences: {}
users:
  - name: test-email
    user:
      token: "1"
`;