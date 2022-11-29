import { SpaceState } from '../../../../../webshell-common-ts/http/v2/space/types/space-state.types';
import { SpaceSummary } from '../../../../../webshell-common-ts/http/v2/space/types/space-summary.types';
import { SpaceHttpService } from '../../../../http-services/space/space.http-services';
import { configService, logger } from '../../system-test';

export const spacesRestApiSuite = () => {
    describe('Spaces REST API test suite', () => {
        const spaceName = 'Test Space';
        const expectedSpaceSummary: SpaceSummary = {
            id: expect.any(String),
            displayName: spaceName,
            connections: [],
            state: SpaceState.Active,
            terminalPreferences: '{}',
            timeCreated: expect.any(Date)
        };
        let spacesService: SpaceHttpService;
        let testSpaceId: string;

        beforeAll(() => {
            spacesService = new SpaceHttpService(configService, logger);
        });

        test('24267: Create and verify a space', async () => {
            testSpaceId = await spacesService.CreateSpace('Test Space');
            expect(testSpaceId).toBeString();

            const spaceSummary = await spacesService.GetSpace(testSpaceId);
            expect(spaceSummary).toMatchObject(expectedSpaceSummary);
        }, 15 * 1000);

        test('24268: Get all spaces', async () => {
            const allSpaces = await spacesService.ListSpaces();
            expect(allSpaces.length).toBeGreaterThanOrEqual(1);

            const foundSpace = allSpaces.find(space => space.id === testSpaceId);
            expect(foundSpace.displayName).toEqual(spaceName);
        }, 15 * 1000);

        test('24269: Close a space with no connections', async () => {
            await spacesService.CloseSpace(testSpaceId);

            // verify space still exists but is closed
            const spaceSummary = await spacesService.GetSpace(testSpaceId);
            expect(spaceSummary.state).toEqual(SpaceState.Closed);
        }, 15 * 1000);
    });
};