import { mockEnvList } from '../../../utils/unit-test-utils';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { KubeGetAgentYamlResponse } from '../../../../webshell-common-ts/http/v2/target/kube/responses/kube-get-agent-yaml.response';

export function kubeYamlMockSetup(): void {
    jest.spyOn(EnvironmentHttpService.prototype, 'ListEnvironments').mockImplementation(async () => mockEnvList);
}

export const mockKubeYaml: KubeGetAgentYamlResponse = {
    yaml: 'test-yaml',
    activationToken: '0'
};