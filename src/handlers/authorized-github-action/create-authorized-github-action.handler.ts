import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import yargs from 'yargs';
import { createAuthorizedGithubActionArgs } from 'handlers/authorized-github-action/create-authorized-github-action.command-builder';
import { AuthorizedGithubActionHttpService } from 'http-services/authorized-github-action/authorized-github-action.http-services';
import { CreateAuthorizedGithubActionRequest } from 'webshell-common-ts/http/v2/authorized-github-action/requests/authorized-github-action-create.requests';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';

export async function createAuthorizedGithubActionHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<createAuthorizedGithubActionArgs>) {

    if(configService.me().type != SubjectType.User) {
        throw new Error(`You cannot authorize Github Actions when logged in as ${configService.me().type}`);
    }

    const authorizedGithubActionHttpService = new AuthorizedGithubActionHttpService(configService, logger);

    const req: CreateAuthorizedGithubActionRequest = {
        githubActionId: argv.githubActionId
    };
    const resp = await authorizedGithubActionHttpService.CreateAuthorizedGithubAction(req);
    logger.info(`Successfully authorized Github Action ${resp.githubActionId}`);
}