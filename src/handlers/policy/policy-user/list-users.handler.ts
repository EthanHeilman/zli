import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { getTableOfUsers } from 'utils/utils';
import yargs from 'yargs';
import { listUserArgs } from 'handlers/policy/policy-user/list-users.command-builder';
import { UserHttpService } from 'http-services/user/user.http-services';

export async function listUsersHandler(
    argv: yargs.Arguments<listUserArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const userHttpService = await UserHttpService.init(configService, logger);
    const users = await userHttpService.ListUsers();
    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(users));
    } else {
        if (users.length === 0){
            logger.info('There are no available users');
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfUsers(users);
        console.log(tableString);
    }

    await cleanExit(0, logger);
}