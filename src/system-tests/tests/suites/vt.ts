import { systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { DbTargetService } from '..../../../http-services/db-target/db-target.http-service';
import got from 'got/dist/source';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import FormData from 'form-data';

import { configService, logger, loggerConfigService } from '../system-test';
import { DigitalOceanBZeroTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { WebTargetService } from '../../../http-services/web-target/web-target.http-service';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { TestTarget } from '../system-test.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';

import { Client } from 'pg';
import fs from 'fs';

export const vtSuite = () => {
    describe('vt suite', () => {
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;

        let testPassed = false;

        const localDbPort = 6100;
        const localWebPort = 6200;
        const webserverRemotePort = 8000;
        const filePath = 'test.txt';

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            await policyService.AddProxyPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy'),
                subjects: [currentUser],
                groups: [],
                description: `Proxy policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: []
            });
        }, 60 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our proxy policy
            const proxyPolicies = await policyService.ListProxyPolicies();
            const proxyPolicy = proxyPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy')
            );
            policyService.DeleteProxyPolicy(proxyPolicy.id);

            // Also attempt to close any daemons to avoid any leaks in the tests
            await callZli(['disconnect', 'db']);
            await callZli(['disconnect', 'web']);
        }, 60 * 1000);


        afterEach(async () => {
            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);

            // Always make sure our ports are free, else throw an error
            try {
                await testUtils.CheckPort(localDbPort);
                await testUtils.CheckPort(localWebPort);
            } catch (e: any) {
                // Always ensure we clean up any dangling connections if there are any errors
                await callZli(['disconnect', 'web']);
                await callZli(['disconnect', 'db']);

                throw e;
            }

            // Reset test passed
            testPassed = false;
        });

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.dbCaseId}: db virtual target connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new db virtual target
                const dbTargetService: DbTargetService = new DbTargetService(configService, logger);
                const dbVtName = `${doTarget.bzeroTarget.name}-db-vt`;

                const createDbTargetResponse = await dbTargetService.CreateDbTarget({
                    targetName: dbVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'localhost',
                    remotePort: { value: 5432 },
                    localHost: 'localhost',
                    localPort: { value: localDbPort },
                    environmentName: systemTestEnvName
                });

                const dbTargetSummary = await dbTargetService.GetDbTarget(createDbTargetResponse.targetId);

                logger.info('Creating db target connection');

                // Start the connection to the db virtual target
                logger.info('Connecting to db target with psql');
                await callZli(['connect', dbVtName]);

                // Ensure the created and connected event exist
                expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', dbTargetSummary.environmentId, ConnectionEventType.Created));
                expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', dbTargetSummary.environmentId, ConnectionEventType.ClientConnect));


                // Attempt to make our PSQL connection and create a database
                const client = new Client({
                    host: 'localhost',
                    port: localDbPort,
                    user: 'postgres',
                    password: '',
                });

                // First make our connection
                try {
                    await client.connect();
                } catch (error) {
                    logger.error(`Error connecting to db: ${error.stack}`);
                    throw error;
                }

                // Then attempt our query
                const PSQL_QUERY = 'CREATE DATABASE somedb';
                const runQuery = new Promise<void>(async (resolve, reject) => {
                    await client.query(PSQL_QUERY)
                        .then((_: any) => {
                            resolve();
                        })
                        .catch((e: any) => {
                            logger.error(`Error running query ${PSQL_QUERY}. Error: ${e.stack}`);
                            reject();
                        });
                });

                await runQuery;
                client.end();

                // Disconnect
                await callZli(['disconnect', 'db']);

                // Ensure the disconnect and close event exist
                expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', dbTargetSummary.environmentId, ConnectionEventType.ClientDisconnect));
                expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', dbTargetSummary.environmentId, ConnectionEventType.Closed));

                // Reset our testPassed flag
                testPassed = true;
            }, 60 * 1000);

            it(`${testTarget.badDbCaseId}: db virtual target bad connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new db virtual target in the default env
                const dbTargetService: DbTargetService = new DbTargetService(configService, logger);
                const dbVtName = `${doTarget.bzeroTarget.name}-db-vt-no-policy`;

                await dbTargetService.CreateDbTarget({
                    targetName: dbVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'localhost',
                    remotePort: { value: 5432 },
                    localHost: 'localhost',
                    localPort: { value: localDbPort },
                    environmentName: 'Default'
                });

                logger.info('Creating db target connection with db target + no policy');

                const expectedErrorMessage = 'Expected error';
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                    throw new Error(expectedErrorMessage);
                });

                // Start the connection to the db virtual target
                const connectZli = callZli(['connect', dbVtName]);

                await expect(connectZli).rejects.toThrow(expectedErrorMessage);

                // Reset our testPassed flag
                testPassed = true;
            }, 60 * 1000);
        });


        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`${testTarget.webCaseId}: web virtual target connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new web virtual target
                const webTargetService: WebTargetService = new WebTargetService(configService, logger);
                const webVtName = `${doTarget.bzeroTarget.name}-web-vt`;

                const createWebTargetResponse = await webTargetService.CreateWebTarget({
                    targetName: webVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'http://localhost',
                    remotePort: { value: webserverRemotePort },
                    localHost: 'localhost',
                    localPort: { value: localWebPort },
                    environmentName: systemTestEnvName
                });

                const webTargetSummary = await webTargetService.GetWebTarget(createWebTargetResponse.targetId);

                logger.info('Creating web target connection');

                // Start the connection to the db virtual target
                await callZli(['connect', webVtName, '--openBrowser=false']);

                // Ensure the created and connected event exist
                expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', webTargetSummary.environmentId, ConnectionEventType.Created));
                expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', webTargetSummary.environmentId, ConnectionEventType.ClientConnect));

                logger.info('Sending http request to web connection');
                const testConnectionRequest = await got.get(`http://localhost:${localWebPort}/`, { throwHttpErrors: false, https: { rejectUnauthorized: false } });

                expect(testConnectionRequest.statusCode).toBe(200);

                // Disconnect
                await callZli(['disconnect', 'web']);

                // Ensure the disconnect and close event exist
                expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', webTargetSummary.environmentId, ConnectionEventType.ClientDisconnect));
                expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', webTargetSummary.environmentId, ConnectionEventType.Closed));

                testPassed = true;
            }, 60 * 1000);

            it(`${testTarget.webCaseId}: web virtual target upload - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;
                const webVtName = `${doTarget.bzeroTarget.name}-web-vt`;

                // Start the connection to the web virtual target
                await callZli(['connect', webVtName, '--openBrowser=false']);

                logger.info('Sending file upload to web connection');
                try {
                    // Create our form data to post
                    const formData = new FormData();

                    // Create our temp file
                    fs.writeFileSync(filePath, 'coolbeans');

                    // Load the file
                    const testFile = fs.openSync(filePath, 'w');

                    // Add it to our form
                    formData.append('file', testFile);

                    // Make our post request
                    const testConnectionRequest = await got.post(`http://localhost:${localWebPort}/`, {
                        throwHttpErrors: false,
                        https: { rejectUnauthorized: false },
                        body: formData
                    });

                    // Our python server does not accept uploads, but if we get these messages we know we were able to send the request
                    expect(testConnectionRequest.statusCode).toEqual(501);
                    expect(testConnectionRequest.statusMessage).toEqual('Not Implemented');
                } finally {
                    // Always attempt to delete the file
                    if (fs.existsSync(filePath)) {
                        // Delete the file
                        fs.unlinkSync(filePath);
                    }
                }

                // Disconnect
                await callZli(['disconnect', 'web']);

                testPassed = true;
            }, 60 * 1000);

            it(`${testTarget.badDbCaseId}: web virtual target bad connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new web virtual target
                const webTargetService: WebTargetService = new WebTargetService(configService, logger);
                const webVtName = `${doTarget.bzeroTarget.name}-web-vt-no-policy`;

                await webTargetService.CreateWebTarget({
                    targetName: webVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'http://localhost',
                    remotePort: { value: webserverRemotePort },
                    localHost: 'localhost',
                    localPort: { value: localWebPort },
                    environmentName: 'Default'
                });

                logger.info('Creating web target connection with web target + no policy');

                const expectedErrorMessage = 'Expected error';
                jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => {
                    throw new Error(expectedErrorMessage);
                });

                // Start the connection to the web virtual target
                const connectZli = callZli(['connect', webVtName, '--openBrowser=false']);

                await expect(connectZli).rejects.toThrow(expectedErrorMessage);

                // Reset our testPassed flag
                testPassed = true;
            }, 60 * 1000);
        });
    });
};