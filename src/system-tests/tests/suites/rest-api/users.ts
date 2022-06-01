import { UserRole } from '../../../../../webshell-common-ts/http/v2/user/types/user-role.types';
import { UserSummary } from '../../../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { UserHttpService } from '../../../../http-services/user/user.http-services';
import { configService, logger } from '../../system-test';

export const userRestApiSuite = () => {
    describe('User REST API Suite', () => {
        let userService: UserHttpService;
        let currentUser: UserSummary;

        beforeAll(() => {
            userService = new UserHttpService(configService, logger);
        });

        test(`23988: Get current user's data`, async () => {
            currentUser = await userService.Me();
            expect(currentUser).toBeDefined();
            expect(currentUser).toEqual(configService.me());
        }, 15 * 1000);

        test(`23989: Get a user's data by ID`, async () => {
            const userSummaryFromId = await userService.GetUserById(currentUser.id);
            expect(userSummaryFromId).toEqual(
                {
                    ...currentUser,
                    lastLogin: expect.anything() // on the back end, GET /users/{id} sets this field before returning but GET /me does not
                });
        }, 15 * 1000);

        test(`23990: Get a user's data by email`, async () => {
            const userSummaryFromEmail = await userService.GetUserByEmail(currentUser.email);
            expect(userSummaryFromEmail).toEqual(currentUser);
        }, 15 * 1000);

        test(`23991: Get all users' data`, async () => {
            const allUsers = await userService.ListUsers();
            const foundUser = allUsers.find(user => user.id === currentUser.id);
            expect(foundUser).toEqual(
                {
                    ...currentUser,
                    lastLogin: expect.anything() // on the back end, GET /users sets this field before returning but GET /me does not
                });
        }, 15 * 1000);

        test(`24237: Edit current user - should fail to change role for self`, async () => {
            let expectedError;

            try {
                await userService.EditUser(currentUser.id, {
                    role: UserRole.User
                });
            } catch (error) {
                expectedError = error;
            }

            expect(expectedError).toBeDefined();
        }, 15 * 1000);
    });
};