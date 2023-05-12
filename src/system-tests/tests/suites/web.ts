import { systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from 'system-tests/tests/system-test';
import { callZli } from 'system-tests/tests/utils/zli-utils';
import got from 'got/dist/source';
import FormData from 'form-data';

import { configService, logger } from 'system-tests/tests/system-test';
import { DigitalOceanBZeroTarget, getDOImageName } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { WebTargetHttpService } from 'http-services/web-target/web-target.http-service';
import { TestUtils } from 'system-tests/tests/utils/test-utils';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from 'webshell-common-ts/http/v2/event/types/connection-event.types';
import { bzeroTestTargetsToRun } from 'system-tests/tests/targets-to-run';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { setupBackgroundDaemonMocks } from 'system-tests/tests/utils/connect-utils';

import fs from 'fs';

const findPort = require('find-open-port');

export const webSuite = () => {
    describe('web suite', () => {
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;
        let webTargetService: WebTargetHttpService;

        let testStartTime: Date;

        // Proxy policy ID created for this entire suite in order to make Web
        // connections
        let proxyPolicyID: string;

        const webserverRemotePort = 8000;
        const filePath = 'test.txt';

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger);
            webTargetService = new WebTargetHttpService(configService, logger);

            const me = configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            proxyPolicyID = (await policyService.AddProxyPolicy({
                name: `${systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy')}-web-suite`,
                subjects: [currentSubject],
                groups: [],
                description: `Proxy policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: []
            })).id;
        }, 60 * 1000);

        beforeEach(() => {
            testStartTime = new Date();
            setupBackgroundDaemonMocks();
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
            await policyService.DeleteProxyPolicy(proxyPolicyID);

            // Also attempt to close any daemons to avoid any leaks in the tests
            await callZli(['disconnect', 'web']);
        }, 60 * 1000);


        afterEach(async () => {
            // Always cleanup web daemons
            await callZli(['disconnect', 'web', '--silent']);
        });

        bzeroTestTargetsToRun.forEach(async (testTarget) => {
            it(`${testTarget.webCaseId}: web virtual target connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new web virtual target
                const localWebPort = await findPort();
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

                const ensureConnectionEvent = async (eventType: ConnectionEventType) => {
                    await testUtils.EnsureConnectionEventCreated({
                        targetId: createWebTargetResponse.targetId,
                        targetName: webVtName,
                        targetType: 'WEB',
                        environmentId: webTargetSummary.environmentId,
                        environmentName: systemTestEnvName,
                        connectionEventType: eventType
                    }, testStartTime);
                };

                // Ensure the created and connected event exist
                await ensureConnectionEvent(ConnectionEventType.Created);
                await ensureConnectionEvent(ConnectionEventType.ClientConnect);

                logger.info('Sending http request to web connection');
                const testConnectionRequest = await got.get(`http://localhost:${localWebPort}/`, { throwHttpErrors: false, https: { rejectUnauthorized: false } });

                expect(testConnectionRequest.statusCode).toBe(200);

                // Disconnect
                await callZli(['disconnect', 'web']);

                // Ensure the disconnect and close event exist
                await ensureConnectionEvent(ConnectionEventType.ClientDisconnect);
                await ensureConnectionEvent(ConnectionEventType.Closed);


            }, 60 * 1000);

            it(`${testTarget.webCaseId}: web virtual target upload - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                const localWebPort = await findPort();
                const webVtName = `${doTarget.bzeroTarget.name}-web-vt-upload`;

                await webTargetService.CreateWebTarget({
                    targetName: webVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'http://localhost',
                    remotePort: { value: webserverRemotePort },
                    localHost: 'localhost',
                    localPort: { value: localWebPort },
                    environmentName: systemTestEnvName
                });

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
                    fs.rmSync(filePath, {force:true});
                }

                // Disconnect
                await callZli(['disconnect', 'web']);


            }, 60 * 1000);

            it(`${testTarget.badWebCaseId}: web virtual target bad connect - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new web virtual target
                const webTargetService: WebTargetHttpService = new WebTargetHttpService(configService, logger);
                const webVtName = `${doTarget.bzeroTarget.name}-web-vt-no-policy`;

                await webTargetService.CreateWebTarget({
                    targetName: webVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'http://localhost',
                    remotePort: { value: webserverRemotePort },
                    localHost: 'localhost',
                    localPort: { value: null },
                    environmentName: 'Default'
                });

                logger.info('Creating web target connection with web target + no policy');

                // Start the connection to the web virtual target
                const connectZli = callZli(['connect', webVtName, '--openBrowser=false']);

                await expect(connectZli).rejects.toThrow();

                // Reset our testPassed flag

            }, 60 * 1000);
        });
    });
};