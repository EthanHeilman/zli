import { DbTargetHttpService } from '../../../../http-services/db-target/db-target.http-service';
import { DigitalOceanBZeroTarget } from '../../../digital-ocean/digital-ocean-target.service.types';
import { configService, logger, systemTestEnvId, systemTestUniqueId, testTargets } from '../../system-test';
import { bzeroTestTargetsToRun } from '../../targets-to-run';

export const databaseTargetRestApiSuite = () => {
    describe('Database Target REST API Suite', () => {
        const targetName = `${systemTestUniqueId}-restapi-db-suite`;
        let databaseTargetId: string;
        let databaseTargetService: DbTargetHttpService;
        let databaseTargetCommonProperties: any;
        let doTarget: DigitalOceanBZeroTarget;

        beforeAll(() => {
            databaseTargetService = new DbTargetHttpService(configService, logger);

            doTarget = testTargets.get(bzeroTestTargetsToRun[0]) as DigitalOceanBZeroTarget;

            // request body uses 'targetName' and response uses 'name' - this object captures the common properties of those two types
            databaseTargetCommonProperties = {
                proxyTargetId: doTarget.bzeroTarget.id,
                remoteHost: 'restapi-db-suite.com',
                remotePort: { value: 222 },
                localHost: null,
                localPort: { value: 333 },
                environmentId: systemTestEnvId
            };
        });

        test('6566: Create and verify a database target', async () => {
            const request = {
                ...databaseTargetCommonProperties,
                targetName: targetName
            };
            const addDatabaseTargetResponse = await databaseTargetService.CreateDbTarget(request);
            databaseTargetId = addDatabaseTargetResponse.targetId;
            expect(databaseTargetId).toBeString();

            // verify that what was requested is what was created
            const retrievedDatabaseTarget = await databaseTargetService.GetDbTarget(databaseTargetId);
            const expectedResponse = { // only a subset of the returned properties
                ...databaseTargetCommonProperties,
                name: targetName,
                localHost: 'localhost' // null was sent in request payload, which should default to 'localhost' on the back end
            };
            expect(retrievedDatabaseTarget).toMatchObject(expectedResponse);
        }, 15 * 1000);

        test('6568: Get all database targets', async () => {
            const databaseTargets = await databaseTargetService.ListDbTargets();
            const filteredTargets = databaseTargets.filter(t => t.id === databaseTargetId);
            expect(filteredTargets.length).toBe(1);
        }, 15 * 1000);

        test('6569: Edit a database target', async () => {
            // edit one property
            const changedName = `${targetName}-edited`;
            let updatedTarget = await databaseTargetService.EditDbTarget(databaseTargetId, {
                targetName: changedName
            });
            expect(updatedTarget.name).toEqual(changedName);

            // edit many properties
            const updatedProperties = {
                remoteHost: 'restapi-db-suite2.com',
                remotePort: { value: 2222 },
                localHost: '192.168.1.3',
                localPort: { value: null as number }
            };
            updatedTarget = await databaseTargetService.EditDbTarget(databaseTargetId, {
                ...updatedProperties,
                targetName: targetName
            });
            expect(updatedTarget).toMatchObject({
                ...updatedProperties,
                name: `${systemTestUniqueId}-restapi-db-suite`
            });
        }, 15 * 1000);

        test('6570: Delete a database target', async () => {
            await databaseTargetService.DeleteDbTarget(databaseTargetId);
            const databaseTargets = await databaseTargetService.ListDbTargets();
            const filteredTargets = databaseTargets.filter(t => t.id === databaseTargetId);
            expect(filteredTargets.length).toBe(0);
        }, 15 * 1000);
    });
};