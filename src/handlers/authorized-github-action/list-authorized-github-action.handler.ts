import { AuthorizedGithubActionHttpService } from '../../../src/http-services/authorized-github-action/authorized-github-action.http-services';
import { UserHttpService } from '../../../src/http-services/user/user.http-services';
import { getTableOfAuthorizedGithubActions } from '../../../src/utils/utils';
import yargs from 'yargs';
import { listAuthorizedGithubActionsArgs } from './list-authorized-github-actions.command-builder';
import { ConfigService } from '../../../src/services/config/config.service';
import { Logger } from '../../../src/services/logger/logger.service';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';

export async function listAuthorizedGithubActionsHandler(
    argv: yargs.Arguments<listAuthorizedGithubActionsArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const authorizedGithubActionHttpService = new AuthorizedGithubActionHttpService(configService, logger);
    const authorizedGithubActions = await authorizedGithubActionHttpService.ListAuthorizedGithubActions();
    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(authorizedGithubActions));
    } else {
        if (authorizedGithubActions.length === 0){
            logger.info('There are no authorized Github Actions');
            return;
        }
        const userHttpService = new UserHttpService(configService, logger);
        const users = await userHttpService.ListUsers();
        const userMap : { [id: string]: UserSummary } = {};
        users.forEach(userSummary => {
            userMap[userSummary.id] = userSummary;
        });

        // regular table output
        const tableString = getTableOfAuthorizedGithubActions(authorizedGithubActions, userMap);
        console.log(tableString);
    }
}