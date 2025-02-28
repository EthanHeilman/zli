import * as cp from 'child_process';
import * as pty from 'node-pty';
import path from 'path';
import { ConnectionEventType } from 'webshell-common-ts/http/v2/event/types/connection-event.types';
import { TargetUser } from 'webshell-common-ts/http/v2/policy/types/target-user.types';
import * as CleanExitHandler from 'handlers/clean-exit.handler';
import { DynamicAccessConnectionUtils } from 'handlers/connect/dynamic-access-connect-utils';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import * as DaemonUtils from 'utils/daemon-utils';
import { DigitalOceanBZeroTarget } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { ContainerBzeroTarget } from 'system-tests/tests/suites/agent-container';
import { DATBzeroTarget } from 'system-tests/tests/suites/dynamic-access';
import { configService, RUN_AS_SERVICE_ACCOUNT, testTargets } from 'system-tests/tests/system-test';
import { bzeroTargetCustomUser, idpUsernameTargetCustomSA, idpUsernameTargetCustomUser } from 'system-tests/tests/system-test-setup';
import { TestTarget } from 'system-tests/tests/system-test.types';
import { getMockResultValue } from 'system-tests/tests/utils/jest-utils';
import { sleepTimeout, TestUtils } from 'system-tests/tests/utils/test-utils';
import { callZli } from 'system-tests/tests/utils/zli-utils';



/**
 * Interface that can be used to abstract any differences between bzero
 * targets in system-tests so that they can share the same common test code
 */
interface ConnectTarget {
    // Connect tests only rely on fields that are common between various targets (id/name)
    id: string;
    name: string;
    environmentId: string;
    type: 'linux' | 'dat-bzero' | 'container-bzero';
    awsRegion: string;

    // The target type is still using the database "ConnectionType" enum from the backend so will either be "SHELL" or "SSM"
    // TODO: Events API should be refactored to use our new API TargetType enum instead
    // https://github.com/cwcrypto/webshell-backend/blob/7a2f60e99b2e897340fae838ed05f293d5c8a9aa/Webshell.WebApp/Controllers/Messages/MessageExtensions.cs#L41
    // https://github.com/bastionzero/webshell-backend/blob/e495940b9e4478fb876dd104c5f7a2bb740f69f1/Webshell.Database/Database/Schema/Types/ConnectionType.cs#L8-L21
    eventTargetType: string;
    targetUser: string;

    writeToStdIn: (data: string, inputCharDelay: number) => Promise<void>;
    getCapturedOutput: () => string[];
    cleanup: () => void | Promise<void>;
};

export interface ConnectTestResult {
    connectionId: string;
    zliConnectPromise: Promise<void>;
}

export class ConnectTestUtils {

    private _connectTargets: ConnectTarget[] = [];

    public constructor(private connectionService: ConnectionHttpService, private testUtils: TestUtils)
    {
    }

    /**
     * Create a shell connection to a target and tests that basic I/O is working
     * in the terminal, connection/command events are being generated correctly,
     * and that the connection service is using the AWS region based on the
     * geo-latency record.
     * @param testTarget The target to connect to
     * @param stringToEcho A string to echo in the shell terminal to test
     * terminal output is working
     * @param exit Boolean indicating if we should type exit in terminal after
     * the test. Note currently this has different behavior for ssm/bzero. Ssm
     * targets will disconnect but keep the connection in the open state so
     * re-attaching can happen whereas bzero targets will close the connection.
     * @returns The ID of the shell connection created
     */
    public async runShellConnectTest(testTarget: TestTarget, stringToEcho: string, exit: boolean, idpUserName: boolean, appName: string = null): Promise<ConnectTestResult> {
        const doTarget = testTargets.get(testTarget);
        const connectTarget = this.getConnectTarget(doTarget, testTarget.awsRegion);
        if(RUN_AS_SERVICE_ACCOUNT && idpUserName) {
            connectTarget.targetUser = idpUsernameTargetCustomSA;
        } else if(idpUserName){
            connectTarget.targetUser = idpUsernameTargetCustomUser;
        }

        return await this.runShellConnectTestHelper(connectTarget, stringToEcho, exit, appName);
    }

    /**
     * Runs shell connect test for a non TestTarget
     * which is specific to Digital Ocean
     */
    public async runNonTestTargetShellConnectTest(target: DATBzeroTarget | ContainerBzeroTarget, stringToEcho: string, exit: boolean): Promise<ConnectTestResult> {
        const connectTarget = this.getConnectTarget(target, target.awsRegion);
        return await this.runShellConnectTestHelper(connectTarget, stringToEcho, exit);
    }

    public async runShellConnectTestHelper(connectTarget: ConnectTarget, stringToEcho: string, exit: boolean, appName: string = null): Promise<ConnectTestResult> {
        const startTime = new Date();

        // Spy on result of the ConnectionHttpService.CreateUniversalConnection
        // call. This spy is used to return the connectionId. For non-DAT
        // targets its also used to assert the correct regional connection node
        // was used to establish the websocket. For DATs spy on
        // ConnectionHttpService.GetShellConnectionAuthDetails because the auth
        // details are only resolved once the DAT comes online and not returned
        // in the original CreateUniversalConnection response
        const createUniversalConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateUniversalConnection');
        const getShellAuthDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails');

        // Call "zli connect"
        // Additionally, calls uses environmentId in the connect string. expected flow is the same
        // We should expect to see this environment variable in the connection event and command event logs
        let targetString = `${connectTarget.targetUser}@${connectTarget.name}`;
        targetString += `.${connectTarget.environmentId}`;

        const connectArgs = ['connect', targetString];
        if(appName) {
            connectArgs.push('--configName', appName);
        }

        const connectPromise = callZli(connectArgs);

        if(connectTarget.type === 'dat-bzero') {
            // For DATs we have to wait for the waitForDATConnection method to
            // return a connection summary which will have the targetId set.
            // Before this the connectTarget.id will be undefined and its used
            // in the rest of the test to assert connection/command events
            const waitForDATConnectionSpy = jest.spyOn(DynamicAccessConnectionUtils.prototype, 'waitForDATConnection');
            await this.testUtils.waitForExpect(async () => expect(waitForDATConnectionSpy).toHaveBeenCalled());
            const finalConnectionSummary = await getMockResultValue(waitForDATConnectionSpy.mock.results[0]);
            connectTarget.id = finalConnectionSummary.targetId;

            // DATs add suffix of user's email to target name
            connectTarget.name += `-${configService.me().email}`;
        }

        // Ensure that the created and connect event exists
        await this.ensureConnectionEvent(connectTarget, ConnectionEventType.ClientConnect, startTime);
        await this.ensureConnectionEvent(connectTarget, ConnectionEventType.Created, startTime);

        // Test echo output in shell and command event generation
        await this.testEchoCommand(connectTarget, stringToEcho, startTime);

        expect(createUniversalConnectionSpy).toHaveBeenCalledOnce();
        const gotUniversalConnectionResponse = await getMockResultValue(createUniversalConnectionSpy.mock.results[0]);
        // Assert that the universal controller was called and the response contains
        // the idp username as target user which means it passed policy check
        expect(gotUniversalConnectionResponse.targetUser).toBe<string>(connectTarget.targetUser);

        // Assert connection auth details returns expected aws region
        if(connectTarget.type === 'dat-bzero') {
            expect(getShellAuthDetailsSpy).toHaveBeenCalledOnce();
            const gotShellAuthDetails = await getMockResultValue(getShellAuthDetailsSpy.mock.results[0]);
            expect(gotShellAuthDetails.region).toBe<string>(connectTarget.awsRegion);
        } else {
            // Disable region check because even though the target is in a
            // specific digital ocean region the aws latency record may still
            // return a different region than we expect due to networking
            // between DO and aws.

            // expect(gotUniversalConnectionResponse.connectionAuthDetails.region).toBe<string>(connectTarget.awsRegion);
        }


        if(exit) {
            await this.sendExitCommand(connectTarget);

            // Wait for connect shell to cleanup
            await connectPromise;

            // Ensure that the client disconnect event is here
            await this.ensureConnectionEvent(connectTarget, ConnectionEventType.ClientDisconnect, startTime);
        }

        return {
            connectionId: gotUniversalConnectionResponse.connectionId,
            zliConnectPromise: connectPromise
        };
    }

    public async sendExitCommand(connectTarget: ConnectTarget) {
        // Send exit to the terminal so the zli connect handler will exit
        // and the test can complete. However we must override the mock
        // implementation of cleanExit to allow the zli connect command to
        // exit with code 1 without causing the test to fail.

        // TODO: This could be cleaned up in the future if we exit the zli
        // with exit code = 0 in this case. Currently there is no way for us
        // to distinguish between a normal closure (user types exit) and an
        // abnormal websocket closure
        jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => Promise.resolve());
        await connectTarget.writeToStdIn('exit', 0);
    }

    public async testEchoCommand(connectTarget: ConnectTarget, stringToEcho: string, startTime: Date) {
        await this.testUtils.waitForExpect(
            async () => {
                // We should get some captured output (from the command
                // prompt on login) before even sending any input
                const capturedOutput = connectTarget.getCapturedOutput();
                expect(capturedOutput.length).toBeGreaterThan(0);

                // Assert the output spy receives the same input sent to stdIn.
                // Keep sending input until the output spy says we've received what
                // we sent (possibly sends command more than once).

                const commandToSend = `echo ${stringToEcho}`;
                await connectTarget.writeToStdIn(commandToSend, 25);

                // Check that the full "hello world" string exists as
                // one of the strings in the captured output. This
                // should be the result of executing the command in the
                // terminal and not a result of typing the 'echo "hello
                // world"' command as writeToStdIn will write this
                // character by character, i.e captured output will
                // contain something like:
                // [... "e","c","h","o"," ","\"","h","e","l","l","o"," ","w","o","r","l","d","\"","\r\n","hello world\r\n", ... ]
                const expectedRegex = [
                    expect.stringMatching(new RegExp(stringToEcho))
                ];
                expect(capturedOutput).toEqual(
                    expect.arrayContaining(expectedRegex),
                );

                // Check that command exists in our backend, its possible this will fail on first attempts if we go too fast
                await this.testUtils.EnsureCommandLogExists(
                    connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType,connectTarget.environmentId, commandToSend, startTime
                );
            },
            1000 * 60,  // Timeout,
            1000 * 1    // Interval
        );
    }

    /**
     * Ensure a connection event exists for a ConnectTarget
     * @param connectTarget The target expected to connect
     * @param eventType The event type to look for
     */
    public async ensureConnectionEvent(connectTarget: ConnectTarget, eventType: ConnectionEventType, startTime: Date) {
        await this.testUtils.EnsureConnectionEventCreated({
            targetId: connectTarget.id,
            targetName: connectTarget.name,
            targetUser: connectTarget.targetUser,
            targetType: connectTarget.eventTargetType,
            environmentId: connectTarget.environmentId,
            connectionEventType: eventType,
            // All shell connections created by the zli exist in the cli-space
            sessionName: 'cli-space'
        }, startTime);
    }

    /**
     * Converts a DigitalOcean target which is either registered as a bzero or a
     * Bzero DAT target into a common interface ConnectTarget that can be used in system-tests
     */
    public getConnectTarget(target: DigitalOceanBZeroTarget | DATBzeroTarget | ContainerBzeroTarget, awsRegion: string) : ConnectTarget {
        const bzeroConnectTarget = this.getBZeroConnectTarget(target, awsRegion);
        this._connectTargets.push(bzeroConnectTarget);
        return bzeroConnectTarget;
    }

    public async cleanup() {
        this._connectTargets.forEach(async target => {
            await target.cleanup();
        });
    }

    private getBZeroConnectTarget(target: DigitalOceanBZeroTarget | DATBzeroTarget | ContainerBzeroTarget, awsRegion: string) {
        let daemonPty: pty.IPty;
        const capturedOutput: string[] = [];

        jest.spyOn(DaemonUtils, 'spawnDaemon').mockImplementation((logger, loggerConfigService, finalDaemonPath, args, customEnv) => {
            return new Promise((resolve, reject) => {
                try {
                    daemonPty = this.spawnDaemonPty(finalDaemonPath, args, customEnv);
                    daemonPty.onData((data: string) => capturedOutput.push(data));
                    daemonPty.onExit((e: { exitCode: number | PromiseLike<number>; }) => resolve(e.exitCode));
                } catch(err) {
                    reject(err);
                }
            });
        });

        let targetId: string;
        let targetName: string;
        let targetUser: string;
        let targetEnvId: string;

        if(target.type === 'linux' || target.type == 'container-bzero') {
            targetId = target.bzeroTarget.id;
            targetName = target.bzeroTarget.name;
            targetEnvId = target.bzeroTarget.environmentId;
            if (target.type === 'linux') {
                targetUser = bzeroTargetCustomUser;
            } else if (target.type === 'container-bzero') {
                targetUser = 'root';
            }
        } else if(target.type === 'dat-bzero') {
            // For DATs we do not know the target ID until after the DAT is
            // created and registers. So set the id as undefined and handle
            // updating this value during the connect test.
            targetId = undefined;
            targetName = target.dynamicAccessConfiguration.name;
            targetEnvId = target.dynamicAccessConfiguration.environmentId;

            // dat provisioner creates docker container targets that only have a
            // single root user
            targetUser = 'root';
        }

        const bzeroConnectTarget: ConnectTarget = {
            id: targetId,
            name: targetName,
            environmentId: targetEnvId,
            awsRegion: awsRegion,
            eventTargetType: 'SHELL',
            targetUser: targetUser,
            type: target.type,
            writeToStdIn: async (data, delay) => {
                if(! daemonPty) {
                    throw new Error('daemonPty is undefined');
                }

                await this.sendMockInput(data, (data) => daemonPty.write(data), delay);
            },
            getCapturedOutput: () => {
                return capturedOutput;
            },
            cleanup: () => {
                if(daemonPty) daemonPty.kill();
            }
        };

        return bzeroConnectTarget;
    }

    /**
     * Gets list of TargetUsers needed in bzero TargetConnect policies to be
     * able to connect to bzero targets
     */
    static getPolicyTargetUsers() : TargetUser[] {
        return [
            {userName: bzeroTargetCustomUser }, // bzero targets
            {userName: '{username}' }, // allow idp username
            {userName: 'root'} // dat targets and force register
        ];
    }

    /**
     * Helper function to send mock input to a zli connect
     * Real humans do not send commands instantaneously, this causes issues in command extraction
     * and in general when sending the input. This function loops over the command and adds an artificial delay
     * in order to allow the command to be logged at the bastion level
     * @param {string} commandToSend Command we want to send
     * @param {writeFunc} writeFunc Function used to write the input data
     * @param {delay} delay Time (in ms) to wait between sending input characters
     */
    private async sendMockInput(commandToSend: string, writeFunc: (data: string) => void, delay: number) {
        const commandSplit = commandToSend.split('');
        for (let i : number = 0; i < commandSplit.length; i++ ){
            const char = commandSplit[i];

            // Send our input char by char
            writeFunc(char);

            // Wait in between each letter being sent
            if(delay > 0) await sleepTimeout(delay);
        }

        // Wait before sending final carriage return to avoid race condition
        // where only part of the command output exists
        await sleepTimeout(2 * 1000);

        // Finally send our enter key
        writeFunc('\r');
    }

    /**
     * Uses https://github.com/microsoft/node-pty#node-pty to fork a new process
     * with pseudoterminal file descriptors. This is needed in order to be able
     * to mock stdio for the shell daemon process which the daemon is expecting
     * to be a tty process. Normally during 'zli connect' the shell daemon
     * process is spawned as a subprocess using child_process.spawn with stdio
     * set to 'inherit' so that the daemon process inherits the stdio of the
     * parent zli process which is itself a tty. This doesn't work however in
     * system-tests where we mock the zli call and the jest test process is not
     * a tty.
     * @param daemonPath path to the daemon process
     * @param args args to pass to the daemon
     * @param cwd current working directory to use for the pty process
     * @returns A promise that resolves with the daemon process exit code
     */
    private spawnDaemonPty(daemonPath: string, args: string[], env: object) {
        // Transform args to be suitable for starting as a forked process
        args = args.map(arg => {
            // Remove any nested quotes from the arguments when using fork (not
            // running inside a shell so quotes wont be interpreted by the shell in
            // this case. pty.spawn has no { shell: true } option like there is for
            // child_process.spawn
            return arg.replace(/['"]+/g, '');
        });

        const ptyProcess = pty.spawn(daemonPath, args, {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: path.dirname(daemonPath),
            env: {...env, ...process.env}
        });

        return ptyProcess;
    }
}

export function setupBackgroundDaemonMocks() {
    // Mocks spawnDaemon DaemonUtils.spawnDaemonInBackground so it doesnt call
    // reportDaemonExitErrors which will cause cleanExit to be called when the
    // daemon exits. This is expected in system tests because we kill the daemon (with zli disconnect) after every test
    jest.spyOn(DaemonUtils, 'spawnDaemonInBackground').mockImplementation(async (logger, loggerConfigService, cwd, daemonPath, args, customEnv) => {
        const options: cp.SpawnOptions = {
            cwd: cwd,
            env: { ...customEnv, ...process.env },
            detached: true,
            shell: true,
            stdio: ['ignore', 'ignore', 'ignore']
        };

        const daemonProcess = await cp.spawn(daemonPath, args, options);

        return daemonProcess;
    });
}