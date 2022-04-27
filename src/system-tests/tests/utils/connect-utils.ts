import * as pty from "node-pty";
import { MockSTDIN, stdin } from "mock-stdin";

import { sleepTimeout } from "./test-utils";
import * as ShellUtilWrappers from '../../../utils/shell-util-wrappers';
import { bzeroTargetCustomUser } from "../system-test-setup";
import { DigitalOceanSSMTarget, DigitalOceanBZeroTarget} from "../../digital-ocean/digital-ocean-ssm-target.service.types";


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

export class ConnectTestUtils {

    public constructor(private mockStdin: MockSTDIN) {}

    /**
     * Converts a DigitalOcean target which is either registered as a bzero or a
     * ssm target into a common interface ConnectTarget that can be used in
     * system-tests
     */
    public getConnectTarget(doTarget: DigitalOceanSSMTarget | DigitalOceanBZeroTarget) : ConnectTarget {
        if(doTarget.type === 'bzero') {

            let daemonPty: pty.IPty;
            let capturedOutput: string[] = [];

            jest.spyOn(ShellUtilWrappers, 'spawnDaemon').mockImplementation((finalDaemonPath, args, cwd) => {
                return new Promise((resolve, reject) => {
                    daemonPty = this.spawnDaemonPty(finalDaemonPath, args, cwd);
                    daemonPty.onData((data) => capturedOutput.push(data));
                    daemonPty.onExit((e) => resolve(e.exitCode));
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
                        throw new Error("daemonPty is undefined");
                    }

                    await this.sendMockInput(data, (data) => daemonPty.write(data));
                },
                getCapturedOutput: () => {
                    return capturedOutput;
                }
            };
        } else if(doTarget.type === 'ssm') {
            let capturedOutput: string[] = [];
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
                        throw new Error("mockStdin is undefined");
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