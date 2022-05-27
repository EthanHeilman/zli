import { defaultMockEnvList } from '../../utils/unit-test-utils';
import * as middlewareHandler from '../middleware.handler';

export function bashMockSetup(): void {
    jest.spyOn(middlewareHandler, 'fetchDataMiddleware').mockImplementationOnce(() => {
        return {
            dynamicConfigs: Promise.resolve([]),
            ssmTargets: Promise.resolve([]),
            clusterTargets: Promise.resolve([]),
            bzeroTargets:  Promise.resolve([]),
            envs: Promise.resolve(defaultMockEnvList),
        };
    });
}