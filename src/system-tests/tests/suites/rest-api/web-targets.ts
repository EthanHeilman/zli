import { WebTargetHttpService } from 'http-services/web-target/web-target.http-service';
import { DigitalOceanBZeroTarget } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { configService, logger, systemTestEnvId, systemTestUniqueId, testTargets } from 'system-tests/tests/system-test';
import { bzeroTestTargetsToRun } from 'system-tests/tests/targets-to-run';

export const webTargetRestApiSuite = () => {
    describe('Web Target REST API Suite', () => {
        const targetName = `${systemTestUniqueId}-restapi-web-suite`;
        let webTargetId: string;
        let webTargetService: WebTargetHttpService;
        let webTargetCommonProperties: any;
        let doTarget: DigitalOceanBZeroTarget;

        beforeAll(async () => {
            webTargetService = await WebTargetHttpService.init(configService, logger);

            doTarget = testTargets.get(bzeroTestTargetsToRun[0]) as DigitalOceanBZeroTarget;

            // request body uses 'targetName' and response uses 'name' - this object captures the common properties of those two types
            webTargetCommonProperties = {
                proxyTargetId: doTarget.bzeroTarget.id,
                remoteHost: 'https://restapi-web-suite.com',
                remotePort: { value: 222 },
                localHost: null,
                localPort: { value: 333 },
                environmentId: systemTestEnvId
            };
        });

        test('10994: Create a web target - should fail because remote host scheme was not specified', async () => {
            // make remoteHost invalid for this request only
            const request = {
                ...webTargetCommonProperties,
                remoteHost: 'hostWithNoScheme',
                targetName: targetName
            };
            let expectedError = undefined;
            try {
                await webTargetService.CreateWebTarget(request);
            } catch (error) {
                expectedError = error;
            }

            expect(expectedError).toBeDefined();
        }, 15 * 1000);

        test('10691: Create and verify a web target', async () => {
            const request = {
                ...webTargetCommonProperties,
                targetName: targetName
            };
            const addWebTargetResponse = await webTargetService.CreateWebTarget(request);
            webTargetId = addWebTargetResponse.targetId;
            expect(webTargetId).toBeString();

            // verify that what was requested is what was created
            const retrievedWebTarget = await webTargetService.GetWebTarget(webTargetId);
            const expectedResponse = { // only a subset of the returned properties
                ...webTargetCommonProperties,
                name: targetName,
                localHost: 'localhost' // null was sent in request payload, which should default to 'localhost' on the back end
            };
            expect(retrievedWebTarget).toMatchObject(expectedResponse);
        }, 15 * 1000);

        test('10693: Get all web targets', async () => {
            const webTargets = await webTargetService.ListWebTargets();
            const filteredTargets = webTargets.filter(t => t.id === webTargetId);
            expect(filteredTargets.length).toBe(1);
        }, 15 * 1000);

        test('10694: Edit a web target', async () => {
            // edit one property
            const changedName = `${targetName}-edited`;
            let updatedTarget = await webTargetService.EditWebTarget(webTargetId, {
                targetName: changedName
            });
            expect(updatedTarget.name).toEqual(changedName);

            // edit many properties
            const updatedProperties = {
                remoteHost: 'http://restapi-web-suite2.com',
                remotePort: { value: 2222 },
                localHost: 'http://192.168.1.2',
                localPort: { value: null as number }
            };
            updatedTarget = await webTargetService.EditWebTarget(webTargetId, {
                ...updatedProperties,
                targetName: targetName
            });
            expect(updatedTarget).toMatchObject({
                ...updatedProperties,
                name: targetName
            });
        }, 15 * 1000);

        test('10695: Delete a web target', async () => {
            await webTargetService.DeleteWebTarget(webTargetId);
            const webTargets = await webTargetService.ListWebTargets();
            const filteredTargets = webTargets.filter(t => t.id === webTargetId);
            expect(filteredTargets.length).toBe(0);
        }, 15 * 1000);
    });
};