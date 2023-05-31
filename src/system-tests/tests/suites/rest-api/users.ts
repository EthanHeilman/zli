import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { SubjectRole } from 'webshell-common-ts/http/v2/subject/types/subject-role.types';
import { UserHttpService } from 'http-services/user/user.http-services';
import { configService, logger, RUN_AS_SERVICE_ACCOUNT, systemTestUser } from 'system-tests/tests/system-test';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { testIf } from 'system-tests/tests/utils/utils';

export const userRestApiSuite = () => {
    describe('User REST API Suite', () => {
        let userService: UserHttpService;

        beforeAll(async () => {
            userService = new UserHttpService(configService, logger);
        });

        testIf(!RUN_AS_SERVICE_ACCOUNT, `23988: Get current user's data as a user`, async () => {
            const me = await userService.Me();
            expect(me).toBeDefined();

            const currentSubject: SubjectSummary = {
                id: me.id,
                organizationId: me.organizationId,
                email: me.email,
                isAdmin: me.isAdmin,
                timeCreated: me.timeCreated,
                lastLogin: me.lastLogin,
                type: SubjectType.User,
            };
            expect(await configService.me()).toEqual(currentSubject);
        }, 15 * 1000);

        test(`23989: Get a user's data by ID`, async () => {
            const userSummaryFromId = await userService.GetUserById(systemTestUser.id);
            expect(userSummaryFromId).toEqual(
                {
                    ...systemTestUser,
                    lastLogin: expect.anything() // on the back end, GET /users/{id} sets this field before returning but GET /me does not
                });
        }, 15 * 1000);

        test(`23990: Get a user's data by email`, async () => {
            const userSummaryFromEmail = await userService.GetUserByEmail(systemTestUser.email);
            expect(userSummaryFromEmail).toEqual(systemTestUser);
        }, 15 * 1000);

        test(`23991: Get all users' data`, async () => {
            const allUsers = await userService.ListUsers();
            const foundUser = allUsers.find(user => user.id === systemTestUser.id);
            expect(foundUser).toEqual(
                {
                    ...systemTestUser,
                    lastLogin: expect.anything() // on the back end, GET /users sets this field before returning but GET /me does not
                });
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, `24237: Edit current user - should fail to change role for self`, async () => {
            expect(() => userService.EditUser(systemTestUser.id, { role: SubjectRole.User})).rejects.toThrow();
        }, 15 * 1000);

        testIf(RUN_AS_SERVICE_ACCOUNT, `510232: Edit user as service account - should fail to change role`, async () => {
            // Service accounts are unable to modify roles of other users
            expect(() => userService.EditUser(systemTestUser.id, { role: SubjectRole.User})).rejects.toThrow();
        }, 15 * 1000);
    });
};