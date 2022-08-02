import { defaultMockEnvList } from '../../utils/unit-test-utils';
import { EnvironmentHttpService } from '../../http-services/environment/environment.http-services';

export function bashMockSetup(): void {
    jest.spyOn(EnvironmentHttpService.prototype, 'ListEnvironments').mockImplementation(async () => defaultMockEnvList);
}