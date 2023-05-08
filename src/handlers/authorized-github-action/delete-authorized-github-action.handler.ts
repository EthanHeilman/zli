import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { AuthorizedGithubActionHttpService } from '../../http-services/authorized-github-action/authorized-github-action.http-services';
import { deleteAuthorizedGithubActionArgs } from './delete-authorized-github-action.command-builder';

export async function deleteAuthorizedGithubActionHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<deleteAuthorizedGithubActionArgs>) {
    const authorizedGithubActionHttpService = new AuthorizedGithubActionHttpService(configService, logger);

    const authorizedGithubActions = await authorizedGithubActionHttpService.ListAuthorizedGithubActions();

    // If this action does not exist
    const authorizedGithubAction = authorizedGithubActions.find(a => a.githubActionId === argv.githubActionId);
    if (!authorizedGithubAction) {
        throw new Error(`No authorized Github Action with ID ${argv.githubActionId} exists`);
    }

    await authorizedGithubActionHttpService.DeleteAuthorizedGithubAction(authorizedGithubAction.id);
    logger.info(`Successfully deleted Github Action ${authorizedGithubAction.githubActionId}`);
}