import { MockProxy, mock } from 'jest-mock-extended';
import { handleLogout, IFileRemover, ILogoutConfigService } from 'handlers/logout/logout.handler';
import { ILogger } from 'webshell-common-ts/logging/logging.types';

// TODO: CWC-2030 Remove these imports once kube and web have been refactored to
// use DaemonManagementService
import { DbConfig, KubeConfig, RDPConfig, getDefaultWebConfig } from 'services/config/config.service.types';
import { IDaemonDisconnector } from 'handlers/disconnect/disconnect.handler';
import { DisconnectResult } from 'services/daemon-management/types/disconnect-result.types';

describe('Logout handler suite', () => {
    // Mocks
    let configServiceMock: MockProxy<ILogoutConfigService>;
    let dbDaemonDisconnectorMock: MockProxy<IDaemonDisconnector<DbConfig>>;
    let rdpDaemonDisconnectorMock: MockProxy<IDaemonDisconnector<RDPConfig>>;
    let kubeDaemonDisconnectorMock: MockProxy<IDaemonDisconnector<KubeConfig>>;
    let fileRemoverMock: MockProxy<IFileRemover>;
    let loggerMock: MockProxy<ILogger>;

    beforeEach(() => {
        // Clear all Jest mocks and spies
        // TODO: CWC-2030 Can be removed once the killDaemon spy is no longer needed
        jest.restoreAllMocks();
        jest.resetAllMocks();
        jest.clearAllMocks();

        // Use jest-mock-extended to more easily create type-safe mocks of
        // interfaces. Each test gets a fresh mock
        configServiceMock = mock<ILogoutConfigService>();
        dbDaemonDisconnectorMock = mock<IDaemonDisconnector<DbConfig>>();
        rdpDaemonDisconnectorMock = mock<IDaemonDisconnector<RDPConfig>>();
        kubeDaemonDisconnectorMock = mock<IDaemonDisconnector<KubeConfig>>();
        loggerMock = mock<ILogger>();
        fileRemoverMock = mock<IFileRemover>();
    });

    test('185382: on logout, all db+rdp+kube connections must close', async () => {
        // Return some default values just to get the test to run
        // TODO: CWC-2030 These stubs can be removed once kube and web have been refactored to use
        // DaemonManagementService
        configServiceMock.getWebConfig.mockReturnValue(getDefaultWebConfig());

        // Stub the mock to return some empty map, so iteration doesn't fail
        // with type error (as mocks by default return undefined)
        dbDaemonDisconnectorMock.disconnectAllDaemons.mockReturnValue(Promise.resolve(new Map<string, DisconnectResult<DbConfig>>()));
        rdpDaemonDisconnectorMock.disconnectAllDaemons.mockReturnValue(Promise.resolve(new Map<string, DisconnectResult<RDPConfig>>()));
        kubeDaemonDisconnectorMock.disconnectAllDaemons.mockReturnValue(Promise.resolve(new Map<string, DisconnectResult<KubeConfig>>()));
        await handleLogout(configServiceMock, dbDaemonDisconnectorMock, rdpDaemonDisconnectorMock, kubeDaemonDisconnectorMock, fileRemoverMock, loggerMock);

        // Assert that logout code disconnects all db+rdp+kube daemons
        expect(dbDaemonDisconnectorMock.disconnectAllDaemons).toHaveBeenCalled();
        expect(rdpDaemonDisconnectorMock.disconnectAllDaemons).toHaveBeenCalled();
        expect(kubeDaemonDisconnectorMock.disconnectAllDaemons).toHaveBeenCalled();
    });
});