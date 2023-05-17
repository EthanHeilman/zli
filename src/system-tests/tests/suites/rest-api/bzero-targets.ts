import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { DigitalOceanBZeroTarget } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { configService, logger, testTargets } from 'system-tests/tests/system-test';
import { bzeroTestTargetsToRun } from 'system-tests/tests/targets-to-run';

export const bzeroTargetRestApiSuite = () => {
    describe('Bzero Target REST API Suite', () => {
        let bzeroTargetService: BzeroTargetHttpService;

        beforeAll(() => {
            bzeroTargetService = new BzeroTargetHttpService(configService, logger);
        });

        test('6431: Get a Bzero target by ID', async () => {
            const doTarget = testTargets.get(bzeroTestTargetsToRun[0]) as DigitalOceanBZeroTarget;
            const bzeroTarget = await bzeroTargetService.GetBzeroTarget(doTarget.bzeroTarget.id);
            expect(bzeroTarget.id).toEqual(doTarget.bzeroTarget.id);
        }, 15 * 1000);

        test('6432: Get all Bzero targets', async () => {
            const bzeroTargets = await bzeroTargetService.ListBzeroTargets();
            expect(bzeroTargets).toEqual(
                expect.arrayContaining(
                    bzeroTestTargetsToRun.map(
                        testTarget => expect.objectContaining({ id: (testTargets.get(testTarget) as DigitalOceanBZeroTarget).bzeroTarget.id }))
                ));
        }, 15 * 1000);

        test('6433: Edit a Bzero target', async () => {
            const doTarget = testTargets.get(bzeroTestTargetsToRun[0]) as DigitalOceanBZeroTarget;
            const bzeroTarget = await bzeroTargetService.GetBzeroTarget(doTarget.bzeroTarget.id);
            const changedName = `${bzeroTarget.name}-edited`;
            const updatedTarget = await bzeroTargetService.EditBzeroTarget(bzeroTarget.id, {
                targetName: changedName
            });
            expect(updatedTarget.name).toEqual(changedName);

            // set the name back to original name in case another test or tooling relies on the name for some reason
            await bzeroTargetService.EditBzeroTarget(bzeroTarget.id, {
                targetName: bzeroTarget.name
            });
        }, 15 * 1000);
    });
};