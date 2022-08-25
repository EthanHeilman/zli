import { MockProxy, mock } from 'jest-mock-extended';
import { handleLogout, IFileRemover, ILogoutConfigService } from './logout.handler';
import { ILogger } from '../../../webshell-common-ts/logging/logging.types';

// TODO: CWC-2030 Remove these imports once kube and web have been refactored to
// use DaemonManagementService
import * as DaemonUtilsService from '../../utils/daemon-utils';
import { DaemonConfig, getDefaultKubeConfig, getDefaultWebConfig } from '../../services/config/config.service.types';
import { IDaemonDisconnector } from '../disconnect/disconnect.handler';
import { DisconnectResult } from '../../services/daemon-management/types/disconnect-result.types';

describe('Logout handler suite', () => {
    // Mocks
    let configServiceMock: MockProxy<ILogoutConfigService>;
    let dbDaemonDisconnectorMock: MockProxy<IDaemonDisconnector>;
    let fileRemoverMock: MockProxy<IFileRemover>;
    let loggerMock: MockProxy<ILogger>;

    beforeEach(() => {
        // Clear all Jest mocks and spies
        // TODO: CWC-2030 Can be removed once the killDaemon spy is no longer needed
        jest.restoreAllMocks();
        jest.resetAllMocks();
        jest.clearAllMocks();

        // Spies
        // TODO: CWC-2030 This stub can be removed once logoutHandler is
        // refactored to use the DaemonManagementService class for both kube and
        // web
        jest.spyOn(DaemonUtilsService, 'killDaemon').mockImplementation(async () => Promise.resolve());

        // Use jest-mock-extended to more easily create type-safe mocks of
        // interfaces.
        // Each test gets a fresh mock
        configServiceMock = mock<ILogoutConfigService>();
        dbDaemonDisconnectorMock = mock<IDaemonDisconnector>();
        loggerMock = mock<ILogger>();
        fileRemoverMock = mock<IFileRemover>();
    });

    test('185382: on logout, all db connections must close', async () => {
        // Return some default values just to get the test to run
        // TODO: CWC-2030 These stubs can be removed once kube and web have been refactored to use
        // DaemonManagementService
        configServiceMock.getKubeConfig.mockReturnValue(getDefaultKubeConfig());
        configServiceMock.getWebConfig.mockReturnValue(getDefaultWebConfig());

        // Stub the mock to return some empty map, so iteration doesn't fail
        // with type error (as mocks by default return undefined)
        dbDaemonDisconnectorMock.disconnectAllDaemons.mockReturnValue(Promise.resolve(new Map<string, DisconnectResult<DaemonConfig>>()));
        await handleLogout(configServiceMock, dbDaemonDisconnectorMock, fileRemoverMock, loggerMock);

        // Assert that logout code disconnects all db daemons
        expect(dbDaemonDisconnectorMock.disconnectAllDaemons).toHaveBeenCalled();
    });
});