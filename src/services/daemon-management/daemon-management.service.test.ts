import { randomUUID } from 'crypto';
import { MockProxy, mock } from 'jest-mock-extended';
import { mapToArrayTuples } from 'utils/unit-test-utils';
import { DaemonConfig, DaemonConfigs, getDefaultDbConfig, getDefaultKubeConfig } from 'services/config/config.service.types';
import { DaemonManagementService, DaemonStore, LEGACY_KEY_STRING, ProcessManager } from 'services/daemon-management/daemon-management.service';
import { DaemonStatus } from 'services/daemon-management/types/daemon-status.types';
import { DisconnectResult } from 'services/daemon-management/types/disconnect-result.types';

// Create mapping objects for test rails case IDs

interface getDaemonConfigsCaseIds {
    legacyConfigSchema: string;
    newConfigSchema: string;
    mixedConfigSchemas: string;
    noConfigs: string;
}
interface addDaemonConfigCaseIds {
    connectionIdDefined: string;
    connectionIdNotDefined: string;
}
interface disconnectDaemonsCaseIds {
    noDaemons: string;
    oneDaemonLocalPidNull: string;
    oneDaemonNewConfigKillFails: string;
    oneDaemonNewConfigKillSuccess: string;
    oneDaemonLegacyConfigKillSuccess: string;
    twoDaemonsNewConfigOneSuccessOneFail: string;
}
interface getDaemonStatusesCaseIds {
    oneDaemonLocalPidNull: string;
}
interface testRailsCaseIdMapping {
    getDaemonConfigs: getDaemonConfigsCaseIds;
    addDaemonConfig: addDaemonConfigCaseIds;
    disconnectDaemons: disconnectDaemonsCaseIds;
    getDaemonStatuses: getDaemonStatusesCaseIds;
}

const makeDaemonManagementServiceTests = <T extends DaemonConfig>(
    newDefaultDaemonConfig: () => T,
    caseIds: testRailsCaseIdMapping
) => {
    describe(`Daemon management service suite (${newDefaultDaemonConfig().type})`, () => {
        // Mocks
        let processManagerMock: MockProxy<ProcessManager>;
        let daemonStoreMock: MockProxy<DaemonStore<T>>;

        // SUT
        let sut: DaemonManagementService<T>;

        beforeEach(() => {
            // Use jest-mock-extended to more easily create type-safe mocks of
            // interfaces. Each test gets a fresh mock
            processManagerMock = mock<ProcessManager>();
            daemonStoreMock = mock<DaemonStore<T>>();

            // Setup default mock behavior that can be changed on a per-test
            // basis by calling mockReturnValue() again on the same mock object
            // injected in the SUT below.
            //
            // Stub getDaemons() to prevent iteration of new config format from
            // failing
            const emptyDaemonsMap: DaemonConfigs<T> = {};
            daemonStoreMock.getDaemons.mockReturnValue(emptyDaemonsMap);

            // Each test gets a fresh SUT
            sut = new DaemonManagementService(newDefaultDaemonConfig, processManagerMock, daemonStoreMock);
        });

        const createDaemonConfigWithLegacySchema = (): [string, T] => {
            const legacyConfig = newDefaultDaemonConfig();
            legacyConfig.localHost = 'localhost';
            legacyConfig.localPort = 1234;
            legacyConfig.localPid = 4321;

            return [LEGACY_KEY_STRING, legacyConfig];
        };

        const createDaemonConfigWithNewSchema = (): [string, T] => {
            // The new schema is the old schema with the addition of a
            // connection ID
            const [_, oldConfig] = createDaemonConfigWithLegacySchema();
            const randomConnectionId = randomUUID();

            return [randomConnectionId, oldConfig];
        };

        describe('get daemon configs', () => {
            test(`${caseIds.getDaemonConfigs.legacyConfigSchema}: when only legacy config schema`, async () => {
                // Create dummy legacy config
                const [connectionId, legacyConfig] = createDaemonConfigWithLegacySchema();
                // Return this legacy config when using the daemon store
                const mockReturnedDaemons: DaemonConfigs<T> = {};
                mockReturnedDaemons[connectionId] = legacyConfig;
                daemonStoreMock.getDaemons.mockReturnValue(mockReturnedDaemons);
                // Use copy of config for making assertions to catch the case that
                // SUT modifies data
                const expectedLegacyConfig = { ...legacyConfig };

                const gotDaemonConfigs = sut.getDaemonConfigs();

                // We expect getDaemonConfigs to return legacy configs with a
                // key = undefined
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([[undefined, expectedLegacyConfig]]);
            });

            test(`${caseIds.getDaemonConfigs.newConfigSchema}: when only new config schema`, async () => {
                // Create dummy new config
                const [connectionId, newConfig] = createDaemonConfigWithNewSchema();
                // Return this new config when using the daemon store
                const mockReturnedDaemons: DaemonConfigs<T> = {};
                mockReturnedDaemons[connectionId] = newConfig;
                daemonStoreMock.getDaemons.mockReturnValue(mockReturnedDaemons);
                // Use copy of config for making assertions to catch the case that
                // SUT modifies data
                const expectedNewConfig = { ...newConfig };

                const gotDaemonConfigs = sut.getDaemonConfigs();

                // We expect getDaemonConfigs to return new configs with a key =
                // connectionId
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([[connectionId, expectedNewConfig]]);
            });

            test(`${caseIds.getDaemonConfigs.mixedConfigSchemas}: when mixed config schemas`, async () => {
                // Create dummy legacy config
                const [connectionIdLegacy, legacyConfig] = createDaemonConfigWithLegacySchema();
                // Create dummy new config
                const [connectionIdNew, newConfig] = createDaemonConfigWithNewSchema();
                const mockReturnedDaemons: DaemonConfigs<T> = {};
                mockReturnedDaemons[connectionIdNew] = newConfig;
                mockReturnedDaemons[connectionIdLegacy] = legacyConfig;
                daemonStoreMock.getDaemons.mockReturnValue(mockReturnedDaemons);
                // Use copy of config for making assertions to catch the case
                // that SUT modifies data
                const expectedLegacyConfig = { ...legacyConfig };
                const expectedNewConfig = { ...newConfig };

                const gotDaemonConfigs = sut.getDaemonConfigs();

                // We expect getDaemonConfigs to return both configs.
                // Use arrayContaining because we don't care about order.
                const gotDaemonConfigsArr = mapToArrayTuples(gotDaemonConfigs);
                expect(gotDaemonConfigsArr).toEqual(expect.arrayContaining(<Array<[string, T]>>([
                    [undefined, expectedLegacyConfig],
                    [connectionIdNew, expectedNewConfig],
                ])));
                // Also check length is correct because we used arrayContaining
                // and not toMatchObject. Source:
                // https://stackoverflow.com/questions/32103252/expect-arrays-to-be-equal-ignoring-order#comment119531655_59142630
                expect(gotDaemonConfigsArr.length).toEqual(2);
            });

            test(`${caseIds.getDaemonConfigs.noConfigs}: when no configs`, async () => {
                const gotDaemonConfigs = sut.getDaemonConfigs();

                // We expect getDaemonConfigs to return nothing
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });
        });

        describe('add daemon config', () => {
            beforeEach(() => {
                // Setup default mock behavior
                //
                // Setup an in-memory store when getting and setting daemons
                let inMemoryStore: DaemonConfigs<T> = {};
                daemonStoreMock.getDaemons.mockReturnValue(inMemoryStore);
                daemonStoreMock.setDaemons.mockImplementation((daemons) => inMemoryStore = daemons);
            });

            test(`${caseIds.addDaemonConfig.connectionIdDefined}: when connectionId is defined`, () => {
                // Create some dummy config
                const [connectionId, newConfig] = createDaemonConfigWithNewSchema();

                // Add it. Then get the configs
                sut.addDaemon(connectionId, newConfig);
                const gotDaemonConfigs = sut.getDaemonConfigs();

                // If we add a daemon using addDaemon, then getDaemonConfigs
                // should show return an updated map with the added daemon
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([[connectionId, newConfig]]);
            });

            test(`${caseIds.addDaemonConfig.connectionIdNotDefined}: when connectionId is not defined`, () => {
                // Create some dummy config
                const [_, legacyConfig] = createDaemonConfigWithLegacySchema();

                // The new schema requires a connectionId to be given, otherwise
                // we will have duplicate config schemas with no way to discern
                // which daemon is which. Therefore, we do not support adding a
                // daemon when connectionId is undefined--we don't even set
                // legacy config.
                expect(() => {
                    sut.addDaemon(undefined, legacyConfig);
                }).toThrow();

                // Nothing should have been added therefore the store should
                // still be empty
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });
        });

        describe('disconnect daemons', () => {
            let inMemoryStore: DaemonConfigs<T>;

            beforeEach(() => {
                // Setup default mock behavior
                //
                // Setup an in-memory store when getting and setting daemons
                // Reset store before every test
                inMemoryStore = {};
                daemonStoreMock.getDaemons.mockReturnValue(inMemoryStore);
                daemonStoreMock.setDaemons.mockImplementation((daemons) => inMemoryStore = daemons);
            });

            test(`${caseIds.disconnectDaemons.noDaemons}: when there are no daemons`, async () => {
                const gotDisconnectResults = await sut.disconnectAllDaemons();
                // We should receive an empty map of results because nothing
                // should happen
                expect(mapToArrayTuples(gotDisconnectResults)).toMatchObject<Array<[string, DisconnectResult<T>]>>([]);

                // The daemon store should still be empty (i.e. what it was at init)
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });

            test(`${caseIds.disconnectDaemons.oneDaemonLocalPidNull}: when there is one daemon whose localPid is null`, async () => {
                const [connectionId, newConfig] = createDaemonConfigWithNewSchema();
                newConfig.localPid = null;
                inMemoryStore[connectionId] = newConfig;

                const gotDisconnectResults = await sut.disconnectAllDaemons();
                // We should receive an empty map of results because nothing
                // should happen
                expect(mapToArrayTuples(gotDisconnectResults)).toMatchObject<Array<[string, DisconnectResult<T>]>>([
                    [connectionId, {
                        type: 'daemon_pid_not_set',
                        daemon: newConfig
                    }]
                ]);

                // The daemon store should be empty because there is no point in
                // keeping a daemon with localPid == null. Local pid being set
                // to null is actually a remanant of legacy code prior to
                // multi-daemon feature. New code doesn't set this to null, but
                // we still must handle it for legacy config
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });

            test(`${caseIds.disconnectDaemons.oneDaemonNewConfigKillFails}: when there is one daemon (new config schema) and it fails to be killed`, async () => {
                const [connectionId, newConfig] = createDaemonConfigWithNewSchema();
                inMemoryStore[connectionId] = newConfig;
                const errorToThrow = new Error('failed to kill');
                processManagerMock.tryKillProcess.mockImplementation(() => { throw errorToThrow; });

                const gotDisconnectResults = await sut.disconnectAllDaemons();
                // We should receive a result that says the daemon failed to be
                // killed
                expect(mapToArrayTuples(gotDisconnectResults)).toMatchObject<Array<[string, DisconnectResult<T>]>>([
                    [connectionId, {
                        type: 'daemon_fail_killed',
                        daemon: newConfig,
                        error: new Error('failed to kill'),
                    }]
                ]);

                // The daemon store should be empty because we delete the config
                // from the store even if we fail to kill
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });

            test(`${caseIds.disconnectDaemons.oneDaemonNewConfigKillSuccess}: when there is one daemon (new config schema) and it is successfully killed`, async () => {
                const [connectionId, newConfig] = createDaemonConfigWithNewSchema();
                inMemoryStore[connectionId] = newConfig;

                processManagerMock.tryKillProcess.mockImplementation(async () => { return 'killed_gracefully'; });

                const gotDisconnectResults = await sut.disconnectAllDaemons();
                // We should receive a result that says the daemon was
                // successfully killed
                expect(mapToArrayTuples(gotDisconnectResults)).toMatchObject<Array<[string, DisconnectResult<T>]>>([
                    [connectionId, {
                        type: 'daemon_success_killed',
                        daemon: newConfig,
                        killResult: 'killed_gracefully'
                    }]
                ]);

                // The daemon store should be empty because we delete the config
                // from the store when it is successfully killed
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });

            test(`${caseIds.disconnectDaemons.oneDaemonLegacyConfigKillSuccess}: when there is one daemon (legacy config schema) and it is successfully killed`, async () => {
                // Create dummy legacy config
                const [connectionId, legacyConfig] = createDaemonConfigWithLegacySchema();
                // Return this legacy config when using the daemon store
                const mockReturnedDaemons: DaemonConfigs<T> = {};
                mockReturnedDaemons[connectionId] = legacyConfig;
                daemonStoreMock.getDaemons.mockReturnValue(mockReturnedDaemons);

                processManagerMock.tryKillProcess.mockImplementation(async () => { return 'killed_gracefully'; });

                const gotDisconnectResults = await sut.disconnectAllDaemons();
                // We should receive a result that says the daemon was
                // successfully killed
                expect(mapToArrayTuples(gotDisconnectResults)).toMatchObject<Array<[string, DisconnectResult<T>]>>([
                    [undefined, {
                        type: 'daemon_success_killed',
                        daemon: legacyConfig,
                        killResult: 'killed_gracefully'
                    }]
                ]);

                // The daemon store should be empty because we delete the config
                // from the store when it is successfully killed
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });

            test(`${caseIds.disconnectDaemons.twoDaemonsNewConfigOneSuccessOneFail}: when there are two daemons (new config schema) where one is successfully killed and the other is not`, async () => {
                const [connectionIdSuccessKill, successConfig] = createDaemonConfigWithNewSchema();
                inMemoryStore[connectionIdSuccessKill] = successConfig;

                const [connectionIdFailKill, failConfig] = createDaemonConfigWithNewSchema();
                const goodPid = 11;
                successConfig.localPid = goodPid;

                const badPid = 10;
                failConfig.localPid = badPid;
                inMemoryStore[connectionIdFailKill] = failConfig;

                processManagerMock.tryKillProcess.calledWith(goodPid).mockImplementation(async () => { return 'killed_forcefully'; });
                // Fail to kill the daemon with the bad pid
                const errorToThrow = new Error('failed to kill');
                processManagerMock.tryKillProcess.calledWith(badPid).mockImplementation(async () => { throw errorToThrow; });

                const gotDisconnectResults = await sut.disconnectAllDaemons();
                // We should receive a result that says the daemon was
                // successfully killed
                expect(mapToArrayTuples(gotDisconnectResults)).toMatchObject<Array<[string, DisconnectResult<T>]>>([
                    [connectionIdSuccessKill, {
                        type: 'daemon_success_killed',
                        daemon: successConfig,
                        killResult: 'killed_forcefully',
                    }],
                    [connectionIdFailKill, {
                        type: 'daemon_fail_killed',
                        daemon: failConfig,
                        error: new Error('failed to kill'),
                    }]
                ]);

                // The daemon store should be empty because we always delete as
                // long as localPid != null
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });
        });

        describe('get daemon statuses', () => {
            let inMemoryStore: DaemonConfigs<T>;

            beforeEach(() => {
                // Setup default mock behavior
                //
                // Setup an in-memory store when getting and setting daemons
                // Reset store before every test
                inMemoryStore = {};
                daemonStoreMock.getDaemons.mockReturnValue(inMemoryStore);
                daemonStoreMock.setDaemons.mockImplementation((daemons) => inMemoryStore = daemons);
            });

            test(`${caseIds.getDaemonStatuses.oneDaemonLocalPidNull}: when there is one daemon whose localPid is null`, async () => {
                const [connectionId, newConfig] = createDaemonConfigWithNewSchema();
                newConfig.localPid = null;
                inMemoryStore[connectionId] = newConfig;

                const gotStatuses = await sut.getAllDaemonStatuses();
                // If PID is empty, then the status is that there is no daemon
                // running at the PID
                expect(mapToArrayTuples(gotStatuses)).toMatchObject<Array<[string, DaemonStatus<T>]>>([
                    [connectionId, {
                        type: 'no_daemon_running',
                        connectionId: connectionId,
                        config: newConfig
                    }]
                ]);

                // The daemon store should be empty
                const gotDaemonConfigs = sut.getDaemonConfigs();
                expect(mapToArrayTuples(gotDaemonConfigs)).toMatchObject<Array<[string, T]>>([]);
            });
        });
    });
};

// Make tests for DbDaemonManagementService
const dbCaseIds : testRailsCaseIdMapping = {
    getDaemonConfigs: {
        legacyConfigSchema: '184708',
        newConfigSchema: '184710',
        mixedConfigSchemas: '184711',
        noConfigs: '184712',
    },
    addDaemonConfig: {
        connectionIdDefined: '184713',
        connectionIdNotDefined: '184714',
    },
    disconnectDaemons: {
        noDaemons: '184715',
        oneDaemonLocalPidNull: '184716',
        oneDaemonNewConfigKillFails: '184717',
        oneDaemonNewConfigKillSuccess: '184718',
        oneDaemonLegacyConfigKillSuccess: '184719',
        twoDaemonsNewConfigOneSuccessOneFail: '184720'
    },
    getDaemonStatuses: {
        oneDaemonLocalPidNull: '184721'
    }
};
makeDaemonManagementServiceTests(getDefaultDbConfig, dbCaseIds);

// Make tests for KubeDaemonManagementService
const kubeCaseIds: testRailsCaseIdMapping = {
    getDaemonConfigs: {
        legacyConfigSchema: '493847',
        newConfigSchema: '493848',
        mixedConfigSchemas: '493849',
        noConfigs: '493850',
    },
    addDaemonConfig: {
        connectionIdDefined: '493851',
        connectionIdNotDefined: '493852',
    },
    disconnectDaemons: {
        noDaemons: '493853',
        oneDaemonLocalPidNull: '493854',
        oneDaemonNewConfigKillFails: '493855',
        oneDaemonNewConfigKillSuccess: '493856',
        oneDaemonLegacyConfigKillSuccess: '493857',
        twoDaemonsNewConfigOneSuccessOneFail: '493858'
    },
    getDaemonStatuses: {
        oneDaemonLocalPidNull: '493859'
    }
};
makeDaemonManagementServiceTests(getDefaultKubeConfig, kubeCaseIds);