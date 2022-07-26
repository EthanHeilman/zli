import { CliDriver } from '../../cli-driver';
import { mockUniversalConnectionRequest, mockUniversalConnectionResponse, mockShellAuthDetails, unitTestMockSetup } from '../../utils/unit-test-utils';
import { ConnectionHttpService } from '../../../src/http-services/connection/connection.http-services';

import * as shellConnectHandler from './shell-connect.handler';
import * as ShellUtils from '../../../src/utils/shell-utils';
import * as CleanExitHandler from '../clean-exit.handler';

import mockArgv from 'mock-argv';


export const connectEnvironmentSuite = () => {
    describe('Open client connections using environment variable', () => {
        beforeEach(() => {
            jest.resetModules();
            jest.clearAllMocks();

            // Mock out necessary services
            unitTestMockSetup(false);
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

        test('Open connection to a Bzero target', async () => {
            // Mock our services
            const getUniversalConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateUniversalConnection').mockImplementation(async () => mockUniversalConnectionResponse);
            const shellHandlerSpy = jest.spyOn(shellConnectHandler, 'shellConnectHandler');
            // Only happens for DATs
            const getShellAuthDetails = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails').mockImplementation(async () => mockShellAuthDetails);
            const startShellDaemonSpy = jest.spyOn(ShellUtils, 'startShellDaemon').mockImplementation(async () => Promise.reject(1));
            const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.resolve());

            // Call the function
            let err = undefined;
            try {
                await mockArgv(['connect', 'ec2-user@bzero-ec2-test.1e8e28fa-6e6b-4fc0-8994-38d69d987978', '--targetType=bzero'], async () => {
                    const driver = new CliDriver();
                    await driver.run(process.argv.slice(2), true);
                });
            } catch (e: any) {
                err = e;
            }
            expect(err).toBeUndefined();
            expect(cleanExitSpy).toHaveBeenCalled();

            // Assert that the getUniversalConnectionSpy was called with mockUniversalConnectionRequest
            /*  targetId: undefined,
                targetName: 'bzero-ec2-test1',
                envId: '1e8e28fa-6e6b-4fc0-8994-38d69d987978',
                envName: undefined,
                targetUser: 'ec2-user',
                targetGroups: undefined,
                targetType: TargetType.Bzero*/
            expect(getUniversalConnectionSpy).toHaveBeenCalledWith(mockUniversalConnectionRequest);

            // Assert that we called the shell connect handler
            expect(shellHandlerSpy).toHaveBeenCalled();

            // Assert that GetShellConnectionAuthDetails was not called
            // This should only be called for DAT targets
            expect(getShellAuthDetails).not.toHaveBeenCalled();

            // Assert that startShellDaemon was called
            // We are simulating that an error occured and we hit reject(1)
            expect(startShellDaemonSpy).toHaveBeenCalled();
        });
    });
};

// calling this here for when running npm test (local tests)
// this exported suite can be included in the system tests if needed
connectEnvironmentSuite();