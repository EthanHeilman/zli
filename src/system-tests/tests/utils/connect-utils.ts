import * as pty from 'node-pty';
import { stdin } from 'mock-stdin';

import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import * as ShellUtilWrappers from '../../../utils/shell-util-wrappers';

import { sleepTimeout, TestUtils } from './test-utils';
import { bzeroTargetCustomUser } from '../system-test-setup';
import { DigitalOceanSSMTarget, DigitalOceanBZeroTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { callZli } from './zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { getMockResultValue } from './jest-utils';
import { testTargets } from '../system-test';
import { TestTarget } from '../system-test.types';
import { TargetUser } from '../../../../webshell-common-ts/http/v2/policy/types/target-user.types';
import { DynamicAccessConnectionUtils } from '../../../handlers/connect/dynamic-access-connect-utils';
import { DATBzeroTarget } from '../suites/dynamic-access';
import { ContainerBzeroTarget } from '../suites/agent-container';

/**
 * Interface that can be used to abstract any differences between ssm/bzero
 * targets in system-tests so that they can share the same common test code
 */
interface ConnectTarget {
    // Connect tests only rely on fields that are common between both ssm/bzero targets (id/name)
    id: string;
    name: string;
    environmentId: string;
    type: 'ssm' | 'bzero' | 'dat-bzero' | 'container-bzero';
    awsRegion: string;

    // The target type is still using the database "ConnectionType" enum from the backend so will either be "SHELL" or "SSM"
    // TODO: Events API should be refactored to use our new API TargetType enum instead
    // https://github.com/cwcrypto/webshell-backend/blob/7a2f60e99b2e897340fae838ed05f293d5c8a9aa/Webshell.WebApp/Controllers/Messages/MessageExtensions.cs#L41
    // https://github.com/bastionzero/webshell-backend/blob/e495940b9e4478fb876dd104c5f7a2bb740f69f1/Webshell.Database/Database/Schema/Types/ConnectionType.cs#L8-L21
    eventTargetType: string;
    targetUser: string;

    writeToStdIn: (data: string) => Promise<void>;
    getCapturedOutput: () => string[];
    cleanup: () => void | Promise<void>;
};

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
     * @param testTarget The target to connect to. Supports both ssm/bzero
     * targets
     * @param stringToEcho A string to echo in the shell terminal to test
     * terminal output is working
     * @param exit Boolean indicating if we should type exit in terminal after
     * the test. Note currently this has different behavior for ssm/bzero. Ssm
     * targets will disconnect but keep the connection in the open state so
     * re-attaching can happen whereas bzero targets will close the connection.
     * @returns The ID of the shell connection created
     */
    public async runShellConnectTest(testTarget: TestTarget, stringToEcho: string, exit: boolean): Promise<string> {
        const doTarget = testTargets.get(testTarget);
        const connectTarget = this.getConnectTarget(doTarget, testTarget.awsRegion);
        return await this.runShellConnectTestHelper(connectTarget, stringToEcho, exit);
    }

    /**
     * Runs shell connect test for a non TestTarget
     * which is specific to Digital Ocean
     */
    public async runNonTestTargetShellConnectTest(target: DATBzeroTarget | ContainerBzeroTarget, stringToEcho: string, exit: boolean): Promise<string> {
        const connectTarget = this.getConnectTarget(target, target.awsRegion);
        return await this.runShellConnectTestHelper(connectTarget, stringToEcho, exit);
    }

    private async runShellConnectTestHelper(connectTarget: ConnectTarget, stringToEcho: string, exit: boolean): Promise<string> {
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
        const connectPromise = callZli(['connect', `${connectTarget.targetUser}@${connectTarget.name}.${connectTarget.environmentId}`]);

        if(connectTarget.type === 'dat-bzero') {
            // For DATs we have to wait for the waitForDATConnection method to
            // return a connection summary which will have the targetId set.
            // Before this the connectTarget.id will be undefined and its used
            // in the rest of the test to assert connection/command events
            const waitForDATConnectionSpy = jest.spyOn(DynamicAccessConnectionUtils.prototype, 'waitForDATConnection');
            await this.testUtils.waitForExpect(async () => expect(waitForDATConnectionSpy).toHaveBeenCalled());
            const finalConnectionSummary = await getMockResultValue(waitForDATConnectionSpy.mock.results[0]);
            connectTarget.id = finalConnectionSummary.targetId;
        }

        // Ensure that the created and connect event exists
        expect(await this.testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, connectTarget.environmentId, ConnectionEventType.ClientConnect));
        expect(await this.testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, connectTarget.environmentId, ConnectionEventType.Created));

        await this.testEchoCommand(connectTarget, stringToEcho);

        expect(createUniversalConnectionSpy).toHaveBeenCalledOnce();
        const gotUniversalConnectionResponse = await getMockResultValue(createUniversalConnectionSpy.mock.results[0]);

        // Assert connection auth details returns expected aws region
        if(connectTarget.type === 'dat-bzero') {
            expect(getShellAuthDetailsSpy).toHaveBeenCalledOnce();
            const gotShellAuthDetails = await getMockResultValue(getShellAuthDetailsSpy.mock.results[0]);
            expect(gotShellAuthDetails.region).toBe<string>(connectTarget.awsRegion);
        } else {
            expect(gotUniversalConnectionResponse.connectionAuthDetails.region).toBe<string>(connectTarget.awsRegion);
        }


        if(exit) {
            await this.sendExitCommand(connectTarget);

            // Wait for connect shell to cleanup
            await connectPromise;

            // Ensure that the client disconnect event is here
            expect(await this.testUtils.EnsureConnectionEventCreated(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, connectTarget.environmentId, ConnectionEventType.ClientDisconnect));
        }

        return gotUniversalConnectionResponse.connectionId;
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
        await connectTarget.writeToStdIn('exit');
    }

    public async testEchoCommand(connectTarget: ConnectTarget, stringToEcho: string) {
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
                    expect.stringMatching(new RegExp(stringToEcho))
                ];
                expect(capturedOutput).toEqual(
                    expect.arrayContaining(expectedRegex),
                );

                // Check that command exists in our backend, its possible this will fail on first attempts if we go too fast
                await this.testUtils.EnsureCommandLogExists(connectTarget.id, connectTarget.name, connectTarget.targetUser, connectTarget.eventTargetType, connectTarget.environmentId, commandToSend);
            },
            1000 * 60,  // Timeout,
            1000 * 1    // Interval
        );
    }

    /**
     * Converts a DigitalOcean target which is either registered as a bzero or a
     * ssm target or a Bzero DAT target into a common interface ConnectTarget
     * that can be used in system-tests
     */
    public getConnectTarget(target: DigitalOceanSSMTarget | DigitalOceanBZeroTarget | DATBzeroTarget | ContainerBzeroTarget, awsRegion: string) : ConnectTarget {
        if(target.type === 'bzero' || target.type === 'dat-bzero' || target.type == 'container-bzero' ) {
            const bzeroConnectTarget = this.getBZeroConnectTarget(target, awsRegion);
            this._connectTargets.push(bzeroConnectTarget);
            return bzeroConnectTarget;
        } else if(target.type === 'ssm') {
            const mockStdin = stdin();
            const capturedOutput: string[] = [];
            jest.spyOn(ShellUtilWrappers, 'pushToStdOut').mockImplementation((output) => {
                capturedOutput.push(Buffer.from(output).toString('utf-8'));
            });

            const ssmConnectTarget: ConnectTarget = {
                id: target.ssmTarget.id,
                name: target.ssmTarget.name,
                awsRegion: awsRegion,
                // no environmentId in ssm targets, so emulates Guid.Empty
                environmentId: '00000000-0000-0000-0000-000000000000',
                eventTargetType: 'SSM',
                targetUser: 'ssm-user',
                type: 'ssm',
                writeToStdIn: async (data) => {
                    if(! mockStdin) {
                        throw new Error('mockStdin is undefined');
                    }
                    await this.sendMockInput(data, (data) => mockStdin.send(data));
                },
                getCapturedOutput: () => {
                    return capturedOutput;
                },
                cleanup: () => {
                    if(mockStdin) {
                        mockStdin.restore();
                    }
                }
            };

            this._connectTargets.push(ssmConnectTarget);
            return ssmConnectTarget;
        }
    }

    public async cleanup() {
        this._connectTargets.forEach(async target => {
            await target.cleanup();
        });
    }

    private getBZeroConnectTarget(target: DigitalOceanBZeroTarget | DATBzeroTarget | ContainerBzeroTarget, awsRegion: string) {
        let daemonPty: pty.IPty;
        const capturedOutput: string[] = [];

        jest.spyOn(ShellUtilWrappers, 'spawnDaemon').mockImplementation((finalDaemonPath, args, cwd) => {
            return new Promise((resolve, reject) => {
                try {
                    daemonPty = this.spawnDaemonPty(finalDaemonPath, args, cwd);
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

        if(target.type === 'bzero' || target.type == 'container-bzero') {
            targetId = target.bzeroTarget.id;
            targetName = target.bzeroTarget.name;
            targetEnvId = target.bzeroTarget.environmentId;
            if (target.type === 'bzero') {
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
            writeToStdIn: async (data) => {
                if(! daemonPty) {
                    throw new Error('daemonPty is undefined');
                }

                await this.sendMockInput(data, (data) => daemonPty.write(data));
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
     * able to connect to bzero/ssm targets
     */
    static getPolicyTargetUsers() : TargetUser[] {
        return [
            {userName: 'ssm-user' }, // ssm targets
            {userName: bzeroTargetCustomUser }, // bzero targets
            {userName: 'root'} // dat targets
        ];
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
            await sleepTimeout(25);
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