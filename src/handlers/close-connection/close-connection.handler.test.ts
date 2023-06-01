import { CliDriver } from 'cli-driver';
import mockArgv from 'mock-argv';
import * as CleanExitHandler from 'handlers/clean-exit.handler';
import { mockConnectionSummary, mockDbConnectionSummary, mockKubeConnectionSummary, mockRDPConnectionSummary, mockSpaceSummary, unitTestMockSetup } from 'utils/unit-test-utils';
import { SpaceHttpService } from 'http-services/space/space.http-services';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { randomUUID } from 'crypto';


describe('Close Connection suite', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Mock out necessary services
        unitTestMockSetup(false);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    test('2982: Close all connections', async () => {
        // Mock our services
        const closeSpaceSpy = jest.spyOn(SpaceHttpService.prototype, 'CloseSpace').mockImplementation(async () => Promise.resolve());
        jest.spyOn(SpaceHttpService.prototype, 'CreateSpace').mockImplementation(async () => 'dummy-connection-id');
        jest.spyOn(SpaceHttpService.prototype, 'ListSpaces').mockImplementation(async () => [mockSpaceSummary]);
        const getConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnection').mockImplementation(async () => mockConnectionSummary);
        jest.spyOn(ConnectionHttpService.prototype, 'CloseConnection').mockImplementation(async () => Promise.resolve());
        jest.spyOn(ConnectionHttpService.prototype, 'ListDbConnections').mockImplementation(async () => Promise.resolve([mockDbConnectionSummary]));
        jest.spyOn(ConnectionHttpService.prototype, 'ListKubeConnections').mockImplementation(async () => Promise.resolve([mockKubeConnectionSummary]));
        jest.spyOn(ConnectionHttpService.prototype, 'ListRDPConnections').mockImplementation(async () => Promise.resolve([mockRDPConnectionSummary]));
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(async () => Promise.resolve());


        // Call the function
        await mockArgv(['close', '-a'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());

        // Assert we didnt call any getConnection call
        expect(getConnectionSpy).not.toHaveBeenCalled();

        // Expect that we have the following
        expect(closeSpaceSpy).toHaveBeenCalledWith(mockSpaceSummary.id);
    });

    test('2983: Close all connections with no cli space', async () => {
        // Mock our services
        const closeSpaceSpy = jest.spyOn(SpaceHttpService.prototype, 'CloseSpace').mockImplementation(async () => Promise.resolve());
        const createSpaceSpy = jest.spyOn(SpaceHttpService.prototype, 'CreateSpace').mockImplementation(async () => 'dummy-connection-id');
        jest.spyOn(SpaceHttpService.prototype, 'ListSpaces').mockImplementation(async () => []);
        const getConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnection').mockImplementation(async () => mockConnectionSummary);
        const closeConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CloseConnection').mockImplementation(async () => Promise.resolve());
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.reject(Error('some-err')));


        // Call the function
        let err = undefined;
        try {
            await mockArgv(['close', '-a'], async () => {
                const driver = new CliDriver();
                await driver.run(process.argv.slice(2), true);
            });
        } catch (e: any) {
            err = e;
        }
        expect(err).toBeDefined();
        expect(cleanExitSpy).toHaveBeenCalledWith(1, expect.anything());


        // Assert we didnt call any getConnection call
        expect(getConnectionSpy).not.toHaveBeenCalled();

        // Expect that we have not called the following
        expect(closeSpaceSpy).not.toHaveBeenCalled();
        expect(createSpaceSpy).not.toHaveBeenCalled();
        expect(closeConnectionSpy).not.toHaveBeenCalled();
    });

    test('2984: Close specific connection', async () => {
        // Mock our services
        const closeSpaceSpy = jest.spyOn(SpaceHttpService.prototype, 'CloseSpace').mockImplementation(async () => Promise.resolve());
        const createSpaceSpy = jest.spyOn(SpaceHttpService.prototype, 'CreateSpace').mockImplementation(async () => 'dummy-space-id');
        jest.spyOn(SpaceHttpService.prototype, 'ListSpaces').mockImplementation(async () => [mockSpaceSummary]);
        const closeConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CloseConnection').mockImplementation(async () => Promise.resolve());
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(async () => Promise.resolve());


        const randomConnectionId = randomUUID();
        // Call the function
        await mockArgv(['close', randomConnectionId], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());

        // Ensure close a specific connection
        expect(closeConnectionSpy).toHaveBeenCalledWith(randomConnectionId);

        // Expect that we have not called the following
        expect(closeSpaceSpy).not.toHaveBeenCalled();
        expect(createSpaceSpy).not.toHaveBeenCalled();
    });
});