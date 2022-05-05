import { SsmTargetHttpService } from '../../../../http-services/targets/ssm/ssm-target.http-services';
import { DigitalOceanSSMTarget } from '../../../digital-ocean/digital-ocean-ssm-target.service.types';
import { configService, logger, testTargets } from '../../system-test';
import { ssmTestTargetsToRun } from '../../targets-to-run';

export const ssmTargetRestApiSuite = () => {
    describe('SSM Target REST API Suite', () => {
        let ssmTargetService: SsmTargetHttpService;

        beforeAll(() => {
            ssmTargetService = new SsmTargetHttpService(configService, logger);
        });

        test('5742: Get an SSM target by ID', async () => {
            const doTarget = testTargets.get(ssmTestTargetsToRun[0]) as DigitalOceanSSMTarget;
            const ssmTarget = await ssmTargetService.GetSsmTarget(doTarget.ssmTarget.id);
            expect(ssmTarget.id).toEqual(doTarget.ssmTarget.id);
        }, 15 * 1000);

        test('5743: Get all SSM targets', async () => {
            const ssmTargets = await ssmTargetService.ListSsmTargets(false);
            // verify that each of the expected SSM targets is in the returned list
            expect(ssmTargets).toEqual(
                expect.arrayContaining(
                    ssmTestTargetsToRun.map(
                        testTarget => expect.objectContaining({ id: (testTargets.get(testTarget) as DigitalOceanSSMTarget).ssmTarget.id }))
                ));
        }, 15 * 1000);

        test('5744: Edit an SSM target', async () => {
            const doTarget = testTargets.get(ssmTestTargetsToRun[0]) as DigitalOceanSSMTarget;
            const ssmTarget = await ssmTargetService.GetSsmTarget(doTarget.ssmTarget.id);
            const changedName = `${ssmTarget.name}-edited`;
            const updatedTarget = await ssmTargetService.EditSsmTarget(ssmTarget.id, {
                name: changedName
            });
            expect(updatedTarget.name).toEqual(changedName);

            // set the name back to original name in case another test or tooling relies on the name for some reason
            await ssmTargetService.EditSsmTarget(ssmTarget.id, {
                name: ssmTarget.name
            });
        }, 15 * 1000);
    });
};
