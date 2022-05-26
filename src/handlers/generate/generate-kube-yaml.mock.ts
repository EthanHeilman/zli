import * as middlewareHandler from '../middleware.handler';
import { mockEnvList } from '../../utils/unit-test-utils';
import { KubeGetAgentYamlResponse } from '../../../webshell-common-ts/http/v2/target/kube/responses/kube-get-agent-yaml.response';

export function kubeYamlMockSetup(): void {
    jest.spyOn(middlewareHandler, 'fetchDataMiddleware').mockImplementationOnce(() => {
        return {
            dynamicConfigs: Promise.resolve([]),
            ssmTargets: Promise.resolve([]),
            clusterTargets: Promise.resolve([]),
            bzeroTargets:  Promise.resolve([]),
            envs: Promise.resolve(mockEnvList),
        };
    });
}

export const mockKubeYaml: KubeGetAgentYamlResponse = {
    yaml: 'test-yaml',
    activationToken: '0'
};