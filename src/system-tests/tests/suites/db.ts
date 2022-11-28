import { systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { DbTargetHttpService } from '..../../../http-services/db-target/db-target.http-service';
import * as ListConnectionsService from '../../../services/list-connections/list-connections.service';

import { configService, logger } from '../system-test';
import { DigitalOceanBZeroTarget, DigitalOceanDistroImage, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { TestTarget } from '../system-test.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Client, Pool } from 'pg';
import { AddNewDbTargetRequest } from '../../../../webshell-common-ts/http/v2/target/db/requests/add-new-db-target.requests';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { getMockResultValue } from '../utils/jest-utils';
import { DaemonManagementService, newDbDaemonManagementService } from '../../../services/daemon-management/daemon-management.service';
import { ProcessManagerService } from '../../../services/process-manager/process-manager.service';
import { DbConnectionInfo } from '../../../../src/services/list-connections/list-connections.service.types';
import { DaemonStatus } from '../../../services/daemon-management/types/daemon-status.types';
import { getListOfAvailPorts, mapToArrayTuples } from '../utils/utils';
import { ConnectionState } from '../../../../webshell-common-ts/http/v2/connection/types/connection-state.types';
import { DbConfig } from '../../../services/config/config.service.types';
import { setupBackgroundDaemonMocks } from '../utils/connect-utils';

const findPort = require('find-open-port');

// Create mapping object and function for test rails case IDs

interface testRailsCaseIdMapping {
    multiDbVirtualTargetConnect: string;
    listDbConnectionsViaListDaemons: string;
    listDbConnectionsViaListConnections: string;
    deletedDbTargetCloseDbConnection: string;
    closeSingleDbConnection: string;
    closeMultipleDbConnectionsViaDisconnect: string;
    closeMultipleDbConnectionsViaCloseAll: string;
    dbReconnectViaDbPool: string;
    dbVirtualTargetConnect: string;
    badDbVirtualTargetConnect: string;
}
function fromTestTargetToCaseIdMapping(testTarget: TestTarget): testRailsCaseIdMapping {
    // Note: We don't have any extraBzeroTargets based on region, so we only
    // have to differentiate on dropletImage for now. This function can change
    // if there are more variables from testTarget that need to be examined in
    // order to differentiate case IDs.
    switch (testTarget.dropletImage) {
    case DigitalOceanDistroImage.BzeroVTAL2TestImage:
        return {
            multiDbVirtualTargetConnect: '186893',
            listDbConnectionsViaListDaemons: '186894',
            listDbConnectionsViaListConnections: '187376',
            deletedDbTargetCloseDbConnection: '187377',
            closeSingleDbConnection: '187378',
            closeMultipleDbConnectionsViaDisconnect: '187379',
            closeMultipleDbConnectionsViaCloseAll: '187380',
            dbReconnectViaDbPool: '187381',
            dbVirtualTargetConnect: '2152',
            badDbVirtualTargetConnect: '2371'
        };
    case DigitalOceanDistroImage.BzeroVTUbuntuTestImage:
        return {
            multiDbVirtualTargetConnect: '187382',
            listDbConnectionsViaListDaemons: '187383',
            listDbConnectionsViaListConnections: '187384',
            deletedDbTargetCloseDbConnection: '187385',
            closeSingleDbConnection: '187386',
            closeMultipleDbConnectionsViaDisconnect: '187387',
            closeMultipleDbConnectionsViaCloseAll: '187388',
            dbReconnectViaDbPool: '187389',
            dbVirtualTargetConnect: '2153',
            badDbVirtualTargetConnect: '2372'
        };
    default:
        throw new Error(`Unexpected distro image: ${testTarget.dropletImage}`);
    }
}

interface CreatedDbTargetDetails {
    targetId: string;
    targetName: string;
    remoteHost: string;
    remotePort: number;
};
interface ConnectedDbDaemonDetails {
    connectionId: string;
    targetId: string;
    dbDaemonDetails: DbConfig
};

export const dbSuite = () => {
    describe('db suite', () => {
        // Services
        let dbTargetService: DbTargetHttpService;
        let connectionHttpService: ConnectionHttpService;
        let policyService: PolicyHttpService;
        let dbDaemonManagementService: DaemonManagementService<DbConfig>;
        let processManager: ProcessManagerService;
        let testUtils: TestUtils;
        let testStartTime: Date;

        // Proxy policy ID created for this entire suite in order to make DB
        // connections
        let proxyPolicyID: string;

        // Track created db targets to cleanup after each test is complete
        let createdDbTargets: CreatedDbTargetDetails[];

        beforeAll(async () => {
            // Construct all services needed to run tests
            dbTargetService = new DbTargetHttpService(configService, logger);
            connectionHttpService = new ConnectionHttpService(configService, logger);

            dbDaemonManagementService = newDbDaemonManagementService(configService);
            processManager = new ProcessManagerService();
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);

            // Set up the policy before all the tests
            const me = configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };
            proxyPolicyID = (await policyService.AddProxyPolicy({
                name: `${systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy')}-db-suite`,
                subjects: [currentSubject],
                groups: [],
                description: `Proxy policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: []
            })).id;
        }, 60 * 1000);

        afterAll(async () => {
            // Cleanup policy after all the tests have finished
            await policyService.DeleteProxyPolicy(proxyPolicyID);
        }, 60 * 1000);

        beforeEach(() => {
            testStartTime = new Date();
            // Reset tracked state of created db targets
            createdDbTargets = [];
            setupBackgroundDaemonMocks();
        });

        afterEach(async () => {
            // Always cleanup db daemons
            await callZli(['disconnect', 'db', '--silent']);

            // Delete tracked db targets
            await Promise.all(createdDbTargets.map(target => dbTargetService.DeleteDbTarget(target.targetId)));
        }, 60 * 1000);

        /**
         * Creates a new DB target
         * @param addDbTargetRequest Request to add a new db target
         * @returns Object with details about the created DB target
         */
        const createDbTargetWithReq = async (addDbTargetRequest: AddNewDbTargetRequest): Promise<CreatedDbTargetDetails> => {
            // Create DB (virtual) target
            const createDbTargetResponse = await dbTargetService.CreateDbTarget(addDbTargetRequest);
            const createdDbTarget: CreatedDbTargetDetails = {
                targetId: createDbTargetResponse.targetId,
                targetName: addDbTargetRequest.targetName,
                remoteHost: addDbTargetRequest.remoteHost,
                remotePort: addDbTargetRequest.remotePort.value
            };
            return createdDbTarget;
        };

        /**
         * Creates a new DB target and tracks it in the test state
         * @param addDbTargetRequest Request to add a new db target
         * @returns Object with details about the created DB target
         */
        const createAndTrackDbTarget = async (addDbTargetRequest: AddNewDbTargetRequest): Promise<CreatedDbTargetDetails> => {
            const createdDbTarget = await createDbTargetWithReq(addDbTargetRequest);

            // Track created DB targets, so they can be cleaned up after each
            // test case
            createdDbTargets.push(createdDbTarget);
            return createdDbTarget;
        };

        describe('happy path: db connect', () => {
            /**
             * Connect to a DB target some number of times
             * @param target DB target to connect to
             * @param numOfConnections Number of connections to make
             * @param customPorts Array of custom ports to use when making the
             * connections. Set array's values to undefined to omit using the
             * --customPort flag when connecting. Length of this array must
             * equal numOfConnections, otherwise an error is thrown.
             * @returns List of connection details
             */
            const connectNumOfTimes = async (target: CreatedDbTargetDetails, numOfConnections: number, customPorts: number[]): Promise<ConnectedDbDaemonDetails[]> => {
                expect(customPorts.length).toBe(numOfConnections);

                const connectedDbDaemons: ConnectedDbDaemonDetails[] = [];
                // Must do this in serial order due to usage of spy
                for (let i = 0; i < numOfConnections; i++) {
                    const connectedDbDaemonDetails = await connectToDbTarget(target, customPorts[i]);
                    connectedDbDaemons.push(connectedDbDaemonDetails);
                }

                return connectedDbDaemons;
            };
            const connectNumOfTimesWithoutCustomPort = async (target: CreatedDbTargetDetails, numOfConnections: number): Promise<ConnectedDbDaemonDetails[]> => {
                return connectNumOfTimes(target, numOfConnections, Array(numOfConnections).fill(undefined));
            };

            /**
             * Wrapper of EnsureConnectionEvent but assumes the event is DB and
             * passes a filter for a specific connectionId
             * @param daemon The daemon expected to connect
             * @param eventType The eventType to filter for
             */
            const ensureConnectionEvent = async (daemon: ConnectedDbDaemonDetails, eventType: ConnectionEventType) => {
                await testUtils.EnsureConnectionEventCreated({
                    targetId: daemon.targetId,
                    targetName: daemon.dbDaemonDetails.name,
                    targetType: 'DB',
                    environmentId: systemTestEnvId,
                    environmentName: systemTestEnvName,
                    connectionEventType: eventType,
                    connectionId: daemon.connectionId
                }, testStartTime);
            };

            /**
             * Ensure the created and connected events exist for a list of
             * connected DB daemons. Polls for the events concurrently for each
             * daemon.
             * @param connectedDbDaemons List of connected db daemons
             */
            const ensureConnectedEvents = async (connectedDbDaemons: ConnectedDbDaemonDetails[]) => {
                await Promise.all(connectedDbDaemons.map(async daemon => {
                    await ensureConnectionEvent(daemon, ConnectionEventType.Created);
                    await ensureConnectionEvent(daemon, ConnectionEventType.ClientConnect);
                }));
            };

            /**
             * Ensure the disconnect and closed events exist for a list of
             * connected DB daemons. Polls for the events concurrently for each
             * daemon.
             * @param connectedDbDaemons List of connected db daemons
             */
            const ensureDisconnectedEvents = async (connectedDbDaemons: ConnectedDbDaemonDetails[]) => {
                await Promise.all(connectedDbDaemons.map(async daemon => {
                    await ensureConnectionEvent(daemon, ConnectionEventType.ClientDisconnect);
                    await ensureConnectionEvent(daemon, ConnectionEventType.Closed);
                }));
            };

            /**
             * Connect to a DB target and wait for the connected events to
             * appear on the Backend
             * @param createdTarget Details about a created DB target
             * @returns Object with details about the connected DB daemon
             */
            const connectAndEnsure = async (createdTarget: CreatedDbTargetDetails): Promise<ConnectedDbDaemonDetails> => {
                const connectedDbDaemonDetails = await connectToDbTarget(createdTarget);
                await ensureConnectedEvents([connectedDbDaemonDetails]);

                return connectedDbDaemonDetails;
            };

            /**
             * Creates a DB target with local port set on the backend (with a
             * randomly available port). Then connects to the target and ensures
             * the connected events exist on the backend.
             * @param nameSuffix Suffix string to add to end of target's name
             * @param target The backing proxy target (Bzero target)
             * @param trackTarget Optional. Tracks the target and deletes it
             * once the test finishes. Defaults to true.
             * @returns Tuple with details about the created DB target and
             * connected DB daemon details
             */
            const createAndConnectDbTarget = async (nameSuffix: string, target: DigitalOceanBZeroTarget, trackTarget: boolean = true): Promise<[CreatedDbTargetDetails, ConnectedDbDaemonDetails]> => {
                const daemonLocalPort = await findPort();

                const createdDbTargetDetails = await createDbTarget(nameSuffix, target, daemonLocalPort, trackTarget);
                const connectedDbDaemonDetails = await connectAndEnsure(createdDbTargetDetails);

                return [createdDbTargetDetails, connectedDbDaemonDetails];
            };

            /**
             * Creates a new DB target with the provided base (proxy) BZero
             * target
             * @param nameSuffix Suffix string to add to end of target's name
             * @param target The backing proxy target (Bzero target)
             * @param daemonLocalPort Optional. If provided, db daemon server
             * will attempt to bind to this port when `zli connect` is called.
             * @param trackTarget Optional. Tracks the target and deletes it
             * once the test finishes. Defaults to true.
             * @returns Object with details about the created DB target
             */
            const createDbTarget = async (nameSuffix: string, target: DigitalOceanBZeroTarget, daemonLocalPort?: number, trackTarget: boolean = true): Promise<CreatedDbTargetDetails> => {
                // Create a new db virtual target
                const dbVtName = nameSuffix.length > 0 ? `${target.bzeroTarget.name}-db-vt-${nameSuffix}` : `${target.bzeroTarget.name}-db-vt`;

                // Set parameters for create db target request
                const addDbTargetRequest = {} as AddNewDbTargetRequest;
                addDbTargetRequest.targetName = dbVtName;
                addDbTargetRequest.proxyTargetId = target.bzeroTarget.id;
                addDbTargetRequest.remoteHost = 'localhost';
                // Our postgres servers run on the default 5432 port
                addDbTargetRequest.remotePort = { value: 5432 };
                // Place these targets in the environment we created a policy
                // for
                addDbTargetRequest.environmentName = systemTestEnvName;
                addDbTargetRequest.localHost = 'localhost';

                // Optionally specify local port config option to test both dynamic
                // ports and non-dynamic port feature of connect
                if (daemonLocalPort) {
                    addDbTargetRequest.localPort = { value: daemonLocalPort };
                } else {
                    addDbTargetRequest.localPort = { value: null };
                }

                if (trackTarget) {
                    return createAndTrackDbTarget(addDbTargetRequest);
                } else {
                    return createDbTargetWithReq(addDbTargetRequest);
                }
            };
            /**
             * Connects to a DB target
             * @param createdDbTargetDetails Details about the db target to connect to
             * @param customPort Optional. If provided, then the --customPort flag is used when connecting
             * @returns Object with details about the started db daemon
             */
            const connectToDbTarget = async (createdDbTargetDetails: CreatedDbTargetDetails, customPort?: number): Promise<ConnectedDbDaemonDetails> => {
                // Start the connection to the db virtual target
                logger.info('Creating db target connection');

                // Add --customPort flag if customPort argument provided
                const createUniversalConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateUniversalConnection');
                const zliArgs = ['connect', createdDbTargetDetails.targetName];
                if (customPort) {
                    zliArgs.push('--customPort', customPort.toString());
                }
                await callZli(zliArgs);

                // Retrieve connection ID from the spy
                expect(createUniversalConnectionSpy).toHaveBeenCalledOnce();
                const gotUniversalConnectionResponse = await getMockResultValue(createUniversalConnectionSpy.mock.results[0]);
                const connectionId = gotUniversalConnectionResponse.connectionId;

                // Grab the DB daemon config from the config store
                const dbConfig = dbDaemonManagementService.getDaemonConfigs().get(connectionId);

                // If dbConfig is not defined, it means it was never added to the
                // map of db daemons
                expect(dbConfig).toBeDefined();

                // Clear the spy, so this function can be called again (in the
                // same test) without leaking state between the spy's
                // invocations
                createUniversalConnectionSpy.mockClear();
                return {
                    connectionId: connectionId,
                    targetId: createdDbTargetDetails.targetId,
                    dbDaemonDetails: dbConfig
                };
            };
            /**
             * Connect to the PSQL DB server using a typescript PG client and
             * execute a SQL query
             * @param daemonLocalPort The db daemon's local server port
             */
            const dbConnectAndExecuteSQL = async (daemonLocalPort: number) => {
                // Attempt to make our PSQL connection
                const client = new Client({
                    // Daemon is spawned on localhost
                    host: 'localhost',
                    port: daemonLocalPort,
                    // Our DB targets have default postgres user
                    user: 'postgres',
                    password: '',
                });

                // Make connection
                try {
                    await client.connect();
                } catch (err) {
                    logger.error(`Error connecting to db: ${err.stack}`);
                    throw err;
                }

                // Make a PSQL query for all connections made to database
                const PSQL_QUERY = 'SELECT * FROM pg_stat_activity';
                try {
                    await client.query(PSQL_QUERY);
                } catch (err) {
                    logger.error(`Error running query ${PSQL_QUERY}. Error: ${err.stack}`);
                    throw err;
                } finally {
                    client.end();
                }
            };
            /**
             * Stops the db daemon by calling the provided closeAction lambda
             * function. Checks that the daemonPid process is not running with a
             * 5 second grace period. Ensures connection closed events are
             * created.
             * @param connectedDbDaemon The connected daemon to stop
             * @param closeAction Lambda function that is expected to perform
             * the logic that stops the db daemon
             */
            const stopDbDaemon = async (
                connectedDbDaemon: ConnectedDbDaemonDetails,
                closeAction: () => Promise<void>
            ) => {
                await closeAction();

                // Ensure the disconnect and close event exist
                await ensureDisconnectedEvents([connectedDbDaemon]);

                // Expect the daemon process to stop running within 5 seconds
                await testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(connectedDbDaemon.dbDaemonDetails.localPid)).toBeFalse(), 5 * 1000);
            };

            bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
                const caseIds = fromTestTargetToCaseIdMapping(testTarget);
                it(`${caseIds.multiDbVirtualTargetConnect}: multi-db virtual target connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Number of DB targets to create
                    const numOfDbTargets = 3;

                    // Send the create DB target requests concurrently
                    const createDbTargetPromises: Promise<CreatedDbTargetDetails>[] = [];
                    for (let i = 0; i < numOfDbTargets; i++) {
                        // Test creating DB target without localPort set to
                        // increase test coverage
                        createDbTargetPromises.push(createDbTarget(`mdb-${i}`, doTarget));
                    }
                    // Wait for all promises to resolve
                    const createdDbTargetDetails = await Promise.all(createDbTargetPromises);

                    // Connect to each db target in serial order. We must do
                    // this in serial order because we're using a spy to capture
                    // the returned connection ID. If we were to do this
                    // concurrently, then the spy calls would capture everything
                    // and it would be hard to track which connectionId is for
                    // which target.
                    const connectedDbDaemons: ConnectedDbDaemonDetails[] = [];
                    for (const details of createdDbTargetDetails) {
                        const connectedDbDaemonDetails = await connectToDbTarget(details);
                        connectedDbDaemons.push(connectedDbDaemonDetails);
                    }

                    // Make another connection to one of the created db targets
                    // using --customPort flag to increase test coverage.
                    expect(createdDbTargetDetails).toBeArrayOfSize(numOfDbTargets);
                    const customPort = await findPort();
                    const connectedDbDaemonDetails = await connectToDbTarget(createdDbTargetDetails[0], customPort);
                    connectedDbDaemons.push(connectedDbDaemonDetails);

                    // Ensure all daemons have successfully connected by
                    // checking for the client connected events on the Bastion
                    await ensureConnectedEvents(connectedDbDaemons);

                    // Connect to each spawned db daemon concurrently, run a SQL
                    // command, and then close the connection via `zli close`.
                    await Promise.all(connectedDbDaemons.map(async details => {
                        await dbConnectAndExecuteSQL(details.dbDaemonDetails.localPort);
                        await stopDbDaemon(
                            details,
                            () => callZli(['close', details.connectionId])
                        );
                    }));
                }, 80 * 1000);

                it(`${caseIds.listDbConnectionsViaListDaemons}: list db connections - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)} - zli ld`, async () => {
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a DB target
                    const createdDbTargetDetails = await createDbTarget('ld', doTarget);

                    // Connect to this DB target x number of times
                    const numOfConnections = 2;
                    const expectedPorts = await getListOfAvailPorts(numOfConnections);
                    const connectedDbDaemons = await connectNumOfTimes(createdDbTargetDetails, numOfConnections, expectedPorts);

                    const getAllDaemonStatusesSpy = jest.spyOn(DaemonManagementService.prototype, 'getAllDaemonStatuses');
                    await callZli(['ld', 'db']);
                    expect(getAllDaemonStatusesSpy).toHaveBeenCalledTimes(1);
                    const gotDbStatuses = (await getMockResultValue(getAllDaemonStatusesSpy.mock.results[0]));
                    const gotDbStatusesAsTuples = mapToArrayTuples(gotDbStatuses);

                    const expectedDbStatuses = connectedDbDaemons.reduce<[string, DaemonStatus<DbConfig>][]>((acc, el, i) => {
                        acc.push([el.connectionId, {
                            type: 'daemon_is_running',
                            connectionId: el.connectionId,
                            config: {
                                type: 'db',
                                name: createdDbTargetDetails.targetName,
                                localPort: expectedPorts[i],
                                localHost: 'localhost',
                                localPid: expect.anything()
                            },
                            status: {
                                type: 'db',
                                localUrl: `localhost:${expectedPorts[i]}`,
                                targetName: createdDbTargetDetails.targetName,
                            }
                        }]);
                        return acc;
                    }, []);

                    expect(gotDbStatusesAsTuples).toEqual(expect.arrayContaining(expectedDbStatuses));
                }, 80 * 1000);

                it(`${caseIds.listDbConnectionsViaListConnections}: list db connections - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)} - zli lc`, async () => {
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a DB target
                    const createdDbTargetDetails = await createDbTarget('list', doTarget);

                    // Connect to this DB target x number of times
                    const numOfConnections = 2;
                    const connectedDbDaemons = await connectNumOfTimesWithoutCustomPort(createdDbTargetDetails, numOfConnections);

                    // lc tests e2e the list connections endpoint
                    const listDbConnectionsSpy = jest.spyOn(ListConnectionsService, 'listOpenDbConnections');
                    await callZli(['lc', '-t', 'db', '--json']);
                    expect(listDbConnectionsSpy).toHaveBeenCalledTimes(1);
                    const gotDbConnectionInfos = (await getMockResultValue(listDbConnectionsSpy.mock.results[0]));
                    const expectedDbConnectionInfos = connectedDbDaemons.map<DbConnectionInfo>(connectionInfo => ({
                        type: 'db',
                        connectionId: connectionInfo.connectionId,
                        targetName: createdDbTargetDetails.targetName,
                        timeCreated: expect.anything(),
                        remoteHost: `${createdDbTargetDetails.remoteHost}:${createdDbTargetDetails.remotePort}`
                    }));

                    // Use arrayContaining, so that got value can contain extra
                    // elements (e.g. other RF users running system tests at the
                    // same time)
                    expect(gotDbConnectionInfos).toEqual(expect.arrayContaining(expectedDbConnectionInfos));
                }, 80 * 1000);

                it(`${caseIds.deletedDbTargetCloseDbConnection}: deleted db target should close db connection - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a DB target and connect. Don't track the target,
                    // so that we can delete in this test.
                    const [createdDbTargetDetails, connectedDbDaemonDetails] = await createAndConnectDbTarget('delete-target', doTarget, false);

                    // Delete the target
                    await dbTargetService.DeleteDbTarget(createdDbTargetDetails.targetId);

                    // The connection state should be CLOSED since we deleted
                    // the target.
                    const connectionDetails = (await connectionHttpService.ListDbConnections()).filter(c => c.id === connectedDbDaemonDetails.connectionId).pop();
                    expect(connectionDetails).toBeDefined();
                    expect(connectionDetails.state).toBe<ConnectionState>(ConnectionState.Closed);
                }, 80 * 1000);

                it(`${caseIds.closeSingleDbConnection}: close single db connection - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)} - zli close`, async () => {
                    // As a user I must be able to close a single DB connection
                    // without closing other DB connections
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a DB target
                    const createdDbTargetDetails = await createDbTarget('close', doTarget);

                    // Connect to this DB target x number of times
                    const numOfConnections = 2;
                    const connectedDbDaemons = await connectNumOfTimesWithoutCustomPort(createdDbTargetDetails, numOfConnections);
                    // Must ensure connection events, so close results in
                    // ClientDisconnect events which are asserted below
                    await ensureConnectedEvents(connectedDbDaemons);

                    // Close the first connection using "zli close". Ensures
                    // closed connection events are present and that the daemon
                    // has stopped running.
                    const connectionToClose = connectedDbDaemons[0];
                    const connectionToStayOpen = connectedDbDaemons[1];
                    await stopDbDaemon(
                        connectionToClose,
                        () => callZli(['close', connectionToClose.connectionId])
                    );

                    // Notice: No need to use zli cli driver directly when
                    // listing connections or getting status as these features
                    // are already tested e2e in cases above. This test strictly
                    // tests "zli close" e2e. Below we are using helper classes
                    // directly (no spies) to assert effects of the close action
                    // above.

                    // Check that the other connection is still open
                    const openDbConnections = await connectionHttpService.ListDbConnections(ConnectionState.Open);
                    // const openDbConnections = await connectionHttpService.ListDbConnections(true);
                    expect(openDbConnections).toEqual(expect.arrayContaining([expect.objectContaining({ id: connectionToStayOpen.connectionId})]));
                    // Since we're using arrayContaining, the call above can
                    // still pass even if it contains the connection which
                    // closed. Therefore, we must also check for non-existence
                    expect(openDbConnections).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: connectionToClose.connectionId})]));

                    // Check that the connection meant to stay open is still
                    // running.
                    // Check that the connection meant to close reports that the
                    // daemon quit unexpectedly.
                    const dbStatuses = await dbDaemonManagementService.getAllDaemonStatuses();
                    const gotDbStatusesAsTuples = mapToArrayTuples(dbStatuses);
                    expect(gotDbStatusesAsTuples).toEqual(expect.arrayContaining([
                        [connectionToStayOpen.connectionId, expect.objectContaining({ type: 'daemon_is_running'})],
                        [connectionToClose.connectionId, expect.objectContaining({ type: 'daemon_quit_unexpectedly'})]
                    ]));

                    // Check that we can still connect and run SQL
                    await dbConnectAndExecuteSQL(connectionToStayOpen.dbDaemonDetails.localPort);

                    // Check that we CANNOT connect and run SQL on the
                    // connection that closed
                    await expect(dbConnectAndExecuteSQL(connectionToClose.dbDaemonDetails.localPort)).rejects.toThrow();
                }, 80 * 1000);

                it(`${caseIds.closeMultipleDbConnectionsViaDisconnect}: close multiple db connections - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)} - zli disconnect db`, async () => {
                    // As a user I must be able to close all of my DB
                    // connections at once without logging out.
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a DB target
                    const createdDbTargetDetails = await createDbTarget('disconnect-db', doTarget);

                    // Connect to this DB target x number of times
                    const numOfConnections = 2;
                    const connectedDbDaemons = await connectNumOfTimesWithoutCustomPort(createdDbTargetDetails, numOfConnections);
                    // Must ensure connection events, so `zli disconnect`
                    // results in ClientDisconnect events which are asserted
                    // below
                    await ensureConnectedEvents(connectedDbDaemons);

                    // Disconnect all DB daemons spawned on this machine
                    await callZli(['disconnect', 'db']);

                    // Ensure the disconnect and close events exist for each
                    // daemon
                    await ensureDisconnectedEvents(connectedDbDaemons);

                    // Assert that each daemon process has stopped running
                    await Promise.all(connectedDbDaemons.map(details =>
                        testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(details.dbDaemonDetails.localPid)).toBeFalse(), 5 * 1000)
                    ));
                }, 80 * 1000);

                it(`${caseIds.closeMultipleDbConnectionsViaCloseAll}: close multiple db connections - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)} - zli close -t db --all`, async () => {
                    // As a user I must be able to close all of my DB
                    // connections at once without logging out.
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a DB target
                    const createdDbTargetDetails = await createDbTarget('close-all-db', doTarget);

                    // Connect to this DB target x number of times
                    const numOfConnections = 2;
                    const connectedDbDaemons = await connectNumOfTimesWithoutCustomPort(createdDbTargetDetails, numOfConnections);
                    // Must ensure connection events, so `zli close` results in
                    // ClientDisconnect events which are asserted below
                    await ensureConnectedEvents(connectedDbDaemons);

                    // Close all DB connections
                    await callZli(['close', '-t', 'db', '--all']);

                    // Ensure the disconnect and close events exist for each
                    // daemon
                    await ensureDisconnectedEvents(connectedDbDaemons);

                    // Assert that each daemon process has stopped running
                    await Promise.all(connectedDbDaemons.map(details =>
                        testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(details.dbDaemonDetails.localPid)).toBeFalse(), 5 * 1000)
                    ));
                }, 80 * 1000);

                it(`${caseIds.dbReconnectViaDbPool}: db virtual target connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)} - reconnect via db pool`, async () => {
                    // This test is for the following requirement from the
                    // Multi-DB ticket (CWC-1739): As a user I must be able to
                    // close a DB connection while a query is running then
                    // reconnect to that same DB and have my DB client reconnect
                    //
                    // We use a DB pool to test this requirement more easily
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create and connect to a DB target
                    const [createdDbTargetDetails, connectedDbDaemonDetails] = await createAndConnectDbTarget('pool', doTarget);

                    let pool: Pool;
                    try {
                        pool = new Pool({
                            host: 'localhost',
                            port: connectedDbDaemonDetails.dbDaemonDetails.localPort,
                            user: 'postgres',
                            password: '',
                            max: 1,
                            min: 0
                        });

                        let numOfPoolErrorsReceived = 0;
                        let numOfCreatedClients = 0;

                        // Pool events Ref: https://github.com/brianc/node-postgres/tree/master/packages/pg-pool#events

                        // Attach an error handler to the pool for when a
                        // connected, idle client receives an error by being
                        // disconnected, etc.
                        pool.on('error', function (error) {
                            logger.error(`Got pool error: ${error}`);
                            numOfPoolErrorsReceived++;
                        });

                        // Fired whenever the pool creates a new pg.Client
                        // instance and successfully connects it to the backend.
                        pool.on('connect', _ => {
                            numOfCreatedClients++;
                        });

                        const getCurrentTimeAndRelease = async () => {
                            const client = await pool.connect();
                            try {
                                await client.query('SELECT now()');
                            } finally {
                                client.release();
                            }
                        };

                        // Make a query
                        await getCurrentTimeAndRelease();

                        // Close the connection which kills the db daemon server
                        await callZli(['close', connectedDbDaemonDetails.connectionId]);
                        await testUtils.waitForExpect(async () => expect(processManager.isProcessRunning(connectedDbDaemonDetails.dbDaemonDetails.localPid)).toBeFalse(), 5 * 1000);

                        // Connect again on the same port
                        await connectAndEnsure(createdDbTargetDetails);

                        // Try to query again which should result in creating
                        // another client connection
                        await getCurrentTimeAndRelease();

                        // We expect a single error, namely a "connection
                        // terminated unexpectedly" error
                        expect(numOfPoolErrorsReceived).toBe(1);

                        // We expect there to be two clients made over the
                        // lifetime of the pool. One for the initial connection.
                        // Then another one after the initial connection failed
                        // (once we killed the daemon), and the pool was forced
                        // to create a new client.
                        expect(numOfCreatedClients).toBe(2);
                    } finally {
                        await pool.end();
                    }
                }, 60 * 1000);

                it(`${caseIds.dbVirtualTargetConnect}: db virtual target connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create and connect to a DB target
                    const [_, connectedDbDaemonDetails] = await createAndConnectDbTarget('', doTarget);

                    await dbConnectAndExecuteSQL(connectedDbDaemonDetails.dbDaemonDetails.localPort);
                    await stopDbDaemon(
                        connectedDbDaemonDetails,
                        () => callZli(['disconnect', 'db'])
                    );
                }, 60 * 1000);
            });
        });

        describe('bad path: db connect', () => {
            bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
                const caseIds = fromTestTargetToCaseIdMapping(testTarget);
                it(`${caseIds.badDbVirtualTargetConnect}: db virtual target bad connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                    const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                    // Create a new db virtual target in the default env (which
                    // has no proxy policy for connect)
                    const dbVtName = `${doTarget.bzeroTarget.name}-db-vt-no-policy`;
                    await createAndTrackDbTarget({
                        targetName: dbVtName,
                        proxyTargetId: doTarget.bzeroTarget.id,
                        remoteHost: 'localhost',
                        remotePort: { value: 5432 },
                        localHost: 'localhost',
                        localPort: { value: null },
                        environmentName: 'Default'
                    });

                    logger.info('Creating db target connection with db target + no policy');

                    // Start the connection to the db virtual target
                    const connectZli = callZli(['connect', dbVtName]);

                    await expect(connectZli).rejects.toThrow();
                }, 60 * 1000);
            });
        });
    });
};