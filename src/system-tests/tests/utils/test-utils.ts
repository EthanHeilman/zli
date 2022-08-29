import *  as fs from 'fs';

import { ConfigService } from '../../../../src/services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { EventsHttpService } from '../../../../src/http-services/events/events.http-server';
import { configService, testStartTime } from '../system-test';
import { LoggerConfigService } from '../../../../src/services/logger/logger-config.service';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { CommandEventDataMessage } from '../../../../webshell-common-ts/http/v2/event/types/command-event-data-message';
import { ConnectionEventDataMessage } from '../../../../webshell-common-ts/http/v2/event/types/connection-event-data-message';
import { EnvironmentHttpService } from '../../../../src/http-services/environment/environment.http-services';
import { AgentStatusChangeData } from '../../../../webshell-common-ts/http/v2/event/types/agent-status-change-data.types';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';

const pids = require('port-pid');

const EVENT_QUERY_TIME = 2;
const SLEEP_TIME = 5;

export const sleepTimeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Class that contains our common testing functions that can be used across tests
 */
export class TestUtils {
    eventsService: EventsHttpService;
    loggerConfigService: LoggerConfigService;
    logger: Logger;
    environmentService: EnvironmentHttpService;

    constructor(configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
        this.eventsService = new EventsHttpService(configService, logger);
        this.loggerConfigService = loggerConfigService;
        this.logger = logger;
        this.environmentService = new EnvironmentHttpService(configService, logger);
    };

    /**
     * Helper function to build a connection event so we can verify it exist in our backend
     * @param {string} targetId Target id we are looking fo
     * @param {string} targetName Target name we are looking for
     * @param {string} targetUsers Target user we are connected as
     * @param {string} targetType Target type we are looking for (i.e. CLUSTER)
     * @param {string} command Command we are looking for
     */
    private async BuildCommandEvent(targetId: string, targetName: string, targetUser: string, targetType: string, targetEnvId: string, targetEnvName: string, command: string): Promise<CommandEventDataMessage> {
        const me = configService.me();
        const toReturn: CommandEventDataMessage = {
            id: expect.anything(),
            connectionId: expect.anything(),
            subjectId: me.id,
            subjectType: SubjectType.User,
            userName: me.email,
            organizationId: me.organizationId,
            targetId: targetId,
            targetType: targetType,
            targetName: targetName,
            targetUser: targetUser,
            timestamp: expect.anything(),
            environmentId: targetEnvId,
            environmentName: targetEnvName,
            command: command
        };
        return toReturn;
    }

    public async EnsureAgentStatusEvent(targetId: string, partialEvent: Partial<AgentStatusChangeData>, timeout: number = 25 * 100, retryInterval: number = 5 * 1000) {
        const defaults: AgentStatusChangeData = {
            id: expect.anything(),
            statusChange: expect.anything(),
            timeStamp: expect.anything(),
            origin: expect.anything(),
            agentPublicKey: expect.anything(),
        };

        const expectedEvent : AgentStatusChangeData = { ...defaults, ...partialEvent};

        // TODO: Add startTime filter
        return await this.waitForExpect(
            async () => {
                const gotEvents = await this.eventsService.GetAgentStatusChangeEvents(targetId, TargetType.Bzero);

                // Use arrayContaining, so that got value can contain extra
                // elements. Include explicit generic constraint, so that jest
                // prints the object if something does not match.
                expect(gotEvents).toEqual<ConnectionEventDataMessage[]>(expect.arrayContaining([expectedEvent]));
            },
            timeout,
            retryInterval
        );
    }

    /**
     * Polls for connection events until it finds a specific event or hits a
     * timeout.
     * @param expectedEvent The event to match for in the array of polled
     * connection events. The argument is a partial type, so that the event can
     * be matched on the test's interested fields. If some field is not
     * specified, an applicable default is used or expect.anything() is used.
     * @param timeout A global timeout that will reject this promise with the
     * last known error from the expectation function as soon as the timeout is
     * reached. Doesn't wait for the final expectation function to finish before
     * rejecting.
     * @param retryInterval Time to wait in-between polls of the
     * GetConnectionsEvents() API
     */
    public async EnsureConnectionEventCreated(partialEvent: Partial<ConnectionEventDataMessage>, timeout: number = 25 * 1000, retryInterval: number = SLEEP_TIME * 1000) : Promise<void>
    {
        const defaultExpectedEnvironmentName =
        // If environmentId is specified and is not equal to the Guid.empty ID (used by SSM targets)
        (partialEvent.environmentId && partialEvent.environmentId !== '00000000-0000-0000-0000-000000000000') &&
        // and the caller never specified environmentName ahead of time
        (! partialEvent.environmentName)
        // then query the backend for the name based on the environmentId
            ? (await this.environmentService.GetEnvironment(partialEvent.environmentId)).name
        // otherwise the default expected environment name is 'n/a'
            : 'n/a';

        const me = configService.me();
        const defaults: ConnectionEventDataMessage = {
            id: expect.anything(),
            connectionId: expect.anything(),
            subjectId: me.id,
            subjectType: SubjectType.User,
            userName: me.email,
            organizationId: me.organizationId,
            sessionId: expect.anything(),
            sessionName: 'n/a',
            targetId: expect.anything(),
            targetType: expect.anything(),
            targetName: expect.anything(),
            targetUser: 'n/a',
            timestamp: expect.anything(),
            environmentId: expect.anything(),
            environmentName: defaultExpectedEnvironmentName,
            connectionEventType: expect.anything(),
            reason: expect.toBeOneOf([null, expect.anything()])
        };
        const expectedEvent : ConnectionEventDataMessage = { ...defaults, ...partialEvent};

        return await this.waitForExpect(
            async () => {
                const gotEvents = await this.eventsService.GetConnectionEvents(
                    testStartTime,
                    [configService.me().id],
                    partialEvent.targetId ? [partialEvent.targetId] : []
                );

                // Use arrayContaining, so that got value can contain extra
                // elements. Include explicit generic constraint, so that jest
                // prints the object if something does not match.
                expect(gotEvents).toEqual<ConnectionEventDataMessage[]>(expect.arrayContaining([expectedEvent]));
            },
            timeout,
            retryInterval
        );
    }

    /**
     * Helper function to ensure that a command log was created
     * @param {string} targetId Target id we are looking for
     * @param {string} targetName Target name we are looking for
     * @param {string} targetUsers Target user we are connected as
     * @param {string} targetType Target type we are looking for (i.e. CLUSTER)
     * @param {string} command Command we are looking for
     */
    public async EnsureCommandLogExists(targetId: string, targetName: string, targetUser: string, targetType: string, targetEnvId: string, command: string) {

        // Query for our events
        const startTimestamp = new Date();
        startTimestamp.setHours(startTimestamp.getHours() - EVENT_QUERY_TIME);
        const commands = await this.eventsService.GetCommandEvent(startTimestamp, [configService.me().id]);

        const commandCreated = commands.find(event => {
            if (event.targetId == targetId && event.targetType == targetType) {
                if (event.command == command) {
                    return true;
                }
            };
        });

        if (commandCreated == undefined) {
            throw new Error(`Unable to find command: ${command} for targetId ${targetId}`);
        }

        // get the environment summary to assert on environment name as well
        let environmentName = 'n/a';
        if(targetEnvId !== '00000000-0000-0000-0000-000000000000') {
            environmentName = (await this.environmentService.GetEnvironment(targetEnvId)).name;
        }

        // Build our connection event
        const commandEvent = this.BuildCommandEvent(targetId, targetName, targetUser, targetType, targetEnvId, environmentName, command);

        // Ensure the values match
        expect(commandCreated).toMatchObject(commandEvent);
    }

    /**
     * Helper function to ensure we see a given kube event
     * @param {string} targetName Target name we are hitting
     * @param {string} role Target role we want to connect as
     * @param {string[]} targetGroup List of target group we want to connect as
     * @param {string} kubeEnglishCommand Kube english command we are expecting
     * @param {string[]} expectedEndpoints List of expected endpoints to have been hit
     */
    public async EnsureKubeEvent(targetName: string, role: string, targetGroup: string[], kubeEnglishCommand: string, expectedEndpoints: string[], expectedExecs: string[]) {
        const kubeEvents = await this.eventsService.GetKubeEvents();
        const me = configService.me();

        const eventWindow = new Date();
        eventWindow.setHours(eventWindow.getHours() - EVENT_QUERY_TIME);

        const kubeEvent = kubeEvents.find(kubeEvent => {
            // Check the basic values that we expect
            if (kubeEvent.targetName == targetName &&
                kubeEvent.role == role &&
                kubeEvent.targetGroups  == targetGroup &&
                kubeEvent.kubeEnglishCommand == kubeEnglishCommand &&
                kubeEvent.userId == me.id &&
                kubeEvent.userEmail == me.email) {
                // Ensure this event has happened recently
                if (kubeEvent.creationDate < eventWindow) {
                    return false;
                }

                // Check the actual endpoint events
                for (let index = 0; index < expectedEndpoints.length; index += 1) {
                    const expectedEndpoint = expectedEndpoints[index];
                    // Check if that expected endpoint is in the list of endpoints
                    if (kubeEvent.endpoints.find(e => e.event == expectedEndpoint) === undefined) {
                        return false;
                    }
                }

                // Check the actual exec events
                for (let index = 0; index < expectedExecs.length; index += 1) {
                    const expectedExec = expectedExecs[index];
                    // Check if that expected endpoint is in the list of endpoints
                    if (kubeEvent.execCommands.find(e => e.event == expectedExec) === undefined) {
                        return false;
                    }
                }

                // Everything has evaluated, return true
                return true;
            }
        });

        // If we are able to validate and find our kube event, return true
        return (kubeEvent !== undefined);
    }

    /**
     * Helper function to check whether a user log was created.
     *
     * @param {string} serviceAction Service action we are looking for
     * @param {boolean} allowed Expected policy evaluation
     * @param {string} context Any expected context string or substring
     * @param {Date} startTime The searched events should be on or after this time. null indicates no filtering based on time.
     */
    public async EnsureUserEventExists(serviceAction: string, allowed?: boolean, context?: string, startTime?: Date): Promise<boolean> {
        const userEvents = await this.eventsService.GetUserEvents(startTime, [configService.me().id]);

        for (let index = 0; index < userEvents.length; index++) {
            const event = userEvents[index];
            if (event.serviceAction === serviceAction &&
                event.evaluation === allowed &&
                (!context || event.context.includes(context))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Helper function to check if a test passed, and if not log the contents of the daemon logs
     * @param {boolean} testPassed Boolean to indicate if the test passed or not
     * @param {string} testName Test name to log incase of failure
     */
    public async CheckDaemonLogs(testPassed: boolean, testName: string) {
        const daemonLogPath = this.loggerConfigService.daemonLogPath();
        if (!fs.existsSync(daemonLogPath)) {
            if (!testPassed) {
                this.logger.warn(`No daemon logs found under ${daemonLogPath}`);
            }
            return;
        };

        if (!testPassed) {
            // Print the logs from the daemon
            try {
                const daemonLogs = fs.readFileSync(daemonLogPath, 'utf8');
                this.logger.error(`Test failed: ${testName}! Daemon logs:\n${daemonLogs}`);
            } catch (err) {
                this.logger.error(`Error reading logs from daemon log file: ${daemonLogPath}. Error: ${err}`);
            }
        }

        // Always delete the daemon log file after each test
        try {
            fs.unlinkSync(daemonLogPath);
        } catch(err) {
            this.logger.error(`Error deleting daemon log file: ${daemonLogPath}. Error: ${err}`);
        }
    }

    /**
     * Helper function to check if there are process' on a given port
     * @param {number} port Port to check
     */
    public async CheckPort(port: number) {
        const ports = new Promise<number[]>(async (resolve, _) => {
            pids(port).then((pids: any) => {
                resolve(pids.tcp);
            });
        });
        const awaitedPorts = await ports;
        if (awaitedPorts.length != 0) {
            throw new Error(`There are currently processes using port ${port}: ${awaitedPorts}`);
        }
    }

    /**
     * Retries an expectation function until it either succeeds or hits a global
     * time out
     * @param expectationFunc The function to retry until it doesnt throw an
     * error
     * @param timeout A global timeout that will reject this promise with the
     * last known error from the expectation function as soon as the timeout is
     * reached. Doesnt wait for the  final expectation function to finish before
     * rejecting.
     * @param retryInterval Time to wait in-between invocations of
     * expectationFunc
     */
    public async waitForExpect<T>(expectationFunc: () => Promise<T>, timeout: number = 30 * 1000, retryInterval: number = 1 * 1000): Promise<T> {
        let done = false;
        let lastError = new Error('Timed out without any error');

        const expectationTimeout = new Promise<T>(async (_, reject) => {
            await sleepTimeout(timeout);

            // Reject with the last error to have occurred
            done = true;
            reject(lastError);
        });

        const runExpectation = new Promise<T>(async (resolve, _) => {
            while(! done) {
                try {
                    const res = await expectationFunc();
                    done = true;
                    resolve(res);
                } catch(err) {
                    lastError = err;
                    await sleepTimeout(retryInterval);
                }
            }
        });

        return Promise.race([expectationTimeout, runExpectation]);
    }
}
