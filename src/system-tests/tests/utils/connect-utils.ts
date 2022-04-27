import * as pty from 'node-pty';
import { MockSTDIN } from 'mock-stdin';

import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import * as ShellUtilWrappers from '../../../utils/shell-util-wrappers';

import { sleepTimeout, TestUtils } from './test-utils';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { DigitalOceanSSMTarget, DigitalOceanBZeroTarget} from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { callZli } from './zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import waitForExpect from 'wait-for-expect';
import { getMockResultValue } from './jest-utils';
import { testTargets } from '../system-test';
import { TestTarget } from '../system-test.types';


/**
 * Interface that can be used to abstract any differences between ssm/bzero
 * targets in system-tests so that they can share the same common test code
 */
interface ConnectTarget {
    // Connect tests only rely on fields that are common between both ssm/bzero targets (id/name)
    id: string;
    name: string;
    type: 'ssm' | 'bzero';

    // The target type is still using the database "ConnectionType" enum from the backend so will either be "SHELL" or "SSM"
    // TODO: Events API should be refactored to use our new API TargetType enum instead
    // https://github.com/cwcrypto/webshell-backend/blob/7a2f60e99b2e897340fae838ed05f293d5c8a9aa/Webshell.WebApp/Controllers/Messages/MessageExtensions.cs#L41
    // https://github.com/bastionzero/webshell-backend/blob/e495940b9e4478fb876dd104c5f7a2bb740f69f1/Webshell.Database/Database/Schema/Types/ConnectionType.cs#L8-L21
    eventTargetType: string;
    targetUser: string;

    writeToStdIn: (data: string) => Promise<void>;
    getCapturedOutput: () => string[];
};

interface CapturedConnectTest {
    // The connection ID of the created connection
    connectionId: string
}

export class ConnectTestUtils {
    public constructor(private mockStdin: MockSTDIN, private connectionService: ConnectionHttpService, private testUtils: TestUtils)
    {
    }

    public async runConnectTest(testTarget: TestTarget): Promise<CapturedConnectTest> {
        const doTarget = testTargets.get(testTarget);
        const connectTarget = this.getConnectTarget(doTarget);

        // Spy on result of the ConnectionHttpService.GetConnection
        // call. This spy is used to assert the correct regional
        // connection node was used to establish the websocket.
        const shellConnectionDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetConnection');

        // Also spy to get the connection Id
        const createConnectionSpy = jest.spyOn(ConnectionHttpService.prototype, 'CreateConnection');

        // Call "zli connect"
        const connectPromise = callZli(['connect', `${connectTarget.targetUser}@${connectTarget.name}`]);

        // Ensure that the created and connect event exists
        expect(await this.testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.ClientConnect));
        expect(await this.testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.Created));

        // Caution to future users of waitForExpect. This function
        // doesn't have a global timeout and instead retries for
        // Math.ceil(timeout / interval) times before failing. Further
        // the interval defaults to 10ms. So if each individual
        // expectation function runs much longer than the 10ms  default
        // interval this function is going to continue to run much
        // longer than the actual timeout. So make sure you set a
        // reasonable timeout and interval value compared to the overall
        // jest test timeout.
        // ref: https://github.com/TheBrainFamily/wait-for-expect/blob/6be6e2ed8e47fd5bc62ab2fc4bd39289c58f2f66/src/index.ts#L25
        await waitForExpect(
            async () => {
                // We should get some captured output (from the command
                // prompt on login) before even sending any input
                const capturedOutput = connectTarget.getCapturedOutput();
                expect(capturedOutput.length).toBeGreaterThan(0);

                // Assert the output spy receives the same input sent to stdIn.
                // Keep sending input until the output spy says we've received what
                // we sent (possibly sends command more than once).

                const commandToSend = 'echo "hello world"';
                await connectTarget.writeToStdIn(commandToSend);

                // Check that the full "hello world" string exists as
                // one of the strings in the captured output. This
                // should be the result of executing the command in the
                // terminal and not a result of typing the 'echo "hello
                // world"' command as writeToStdIn will write this
                // character by character, i.e captured output will
                // contain something like:
                // [... "e","c","h","o"," ","\"","h","e","l","l","o"," ","w","o","r","l","d","\"","\r\n","hello world\r\n", ... ]
                const expectedRegex = [
                    expect.stringMatching(new RegExp('hello world'))
                ];
                expect(capturedOutput).toEqual(
                    expect.arrayContaining(expectedRegex),
                );

                // Check that 'echo "hello world"' command exists in our backend, its possible this will fail on first attempts if we go too fast
                await this.testUtils.EnsureCommandLogExists(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, commandToSend);
            },
            1000 * 10,  // Timeout,
            1000 * 1    // Interval
        );

        // Assert shell connection auth details returns expected
        // connection node aws region
        expect(shellConnectionDetailsSpy).toHaveBeenCalled();
        const gotShellConnectionDetails = await getMockResultValue(shellConnectionDetailsSpy.mock.results[0]);
        const shellConnectionAuthDetails = await this.connectionService.GetShellConnectionAuthDetails(gotShellConnectionDetails.id);
        expect(shellConnectionAuthDetails.region).toBe<string>(testTarget.awsRegion);

        // Send exit to the terminal so the zli connect handler will exit
        // and the test can complete. However we must override the mock
        // implementation of cleanExit to allow the zli connect command to
        // exit with code 1 without causing the test to fail.

        // TODO: This could be cleaned up in the future if we exit the zli
        // with exit code = 0 in this case. Currently there is no way for us
        // to distinguish between a normal closure (user types exit) and an
        // abnormal websocket closure
        jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => Promise.resolve());
        await connectTarget.writeToStdIn('exit');

        // Wait for connect shell to cleanup
        await connectPromise;

        // Set our connectionId
        expect(createConnectionSpy).toHaveBeenCalled();
        const connectionId = await getMockResultValue(createConnectionSpy.mock.results[0]);

        // Ensure that the client disconnect event is here
        // Note, there is no close event since we do not close the connection, just disconnect from it
        expect(await this.testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, ConnectionEventType.ClientDisconnect));

        return {
            connectionId: connectionId
        }
    }

    /**
     * Converts a DigitalOcean target which is either registered as a bzero or a
     * ssm target into a common interface ConnectTarget that can be used in
     * system-tests
     */
    public getConnectTarget(doTarget: DigitalOceanSSMTarget | DigitalOceanBZeroTarget) : ConnectTarget {
        if(doTarget.type === 'bzero') {

            let daemonPty: pty.IPty;
            const capturedOutput: string[] = [];

            jest.spyOn(ShellUtilWrappers, 'spawnDaemon').mockImplementation((finalDaemonPath, args, cwd) => {
                return new Promise((resolve, reject) => {
                    try {
                        daemonPty = this.spawnDaemonPty(finalDaemonPath, args, cwd);
                        daemonPty.onData((data) => capturedOutput.push(data));
                        daemonPty.onExit((e) => resolve(e.exitCode));
                    } catch(err) {
                        reject(err);
                    }
                });
            });

            return {
                id: doTarget.bzeroTarget.id,
                name: doTarget.bzeroTarget.name,
                eventTargetType: 'SHELL',
                targetUser: bzeroTargetCustomUser,
                type: 'bzero',
                writeToStdIn: async (data) => {
                    if(! daemonPty) {
                        throw new Error('daemonPty is undefined');
                    }

                    await this.sendMockInput(data, (data) => daemonPty.write(data));
                },
                getCapturedOutput: () => {
                    return capturedOutput;
                }
            };
        } else if(doTarget.type === 'ssm') {
            const capturedOutput: string[] = [];
            jest.spyOn(ShellUtilWrappers, 'pushToStdOut').mockImplementation((output) => {
                capturedOutput.push(Buffer.from(output).toString('utf-8'));
            });

            return {
                id: doTarget.ssmTarget.id,
                name: doTarget.ssmTarget.name,
                eventTargetType: 'SSM',
                targetUser: 'ssm-user',
                type: 'ssm',
                writeToStdIn: async (data) => {
                    if(! this.mockStdin) {
                        throw new Error('mockStdin is undefined');
                    }
                    await this.sendMockInput(data, (data) => this.mockStdin.send(data));
                },
                getCapturedOutput: () => {
                    return capturedOutput;
                }
            };
        }
    }

    /**
     * Helper function to send mock input to a zli connect
     * Real humans do not send commands instantaneously, this causes issues in command extraction
     * and in general when sending the input. This function loops over the command and adds an artificial delay
     * in order to allow the command to be logged at the bastion level
     * @param {string} commandToSend Command we want to send
     * @param {writeFunc} writeFunc Function used to write the input data
     */
    private async sendMockInput(commandToSend: string, writeFunc: (data: string) => void) {
        const commandSplit = commandToSend.split('');
        for (let i : number = 0; i < commandSplit.length; i++ ){
            const char = commandSplit[i];

            // Send our input char by char
            writeFunc(char);

            // Wait in between each letter being sent
            await sleepTimeout(10);
        }

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
     * @param path path to the daemon process
     * @param args args to pass to the daemon
     * @param cwd current working directory to use for the pty process
     * @returns A promise that resolves with the daemon process exit code
     */
    private spawnDaemonPty(path: string, args: string[], cwd: string) {
        // Transform args to be suitable for starting as a forked process
        args = args.map(arg => {
            // Remove any nested quotes from the arguments when using fork (not
            // running inside a shell so quotes wont be interpreted by the shell in
            // this case. pty.spawn has no { shell: true } option like there is for
            // child_process.spawn
            return arg.replace(/['"]+/g, '');
        });

        const ptyProcess = pty.spawn(path, args, {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: cwd,
        });

        return ptyProcess;
    }
}