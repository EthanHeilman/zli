import yargs from 'yargs';

export type createAuthorizedGithubActionArgs = { githubActionId: string };

export function createAuthorizedGithubActionCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<createAuthorizedGithubActionArgs> {
    return yargs
        .positional(
            'githubActionId',
            {
                nargs: 1,
                type: 'string',
                demandOption: true,
                describe: 'The Github ID for the action to be authorized'
            }
        )
        .example('$0 authorized-action create repo:mygithuborg/example-repo:ref:refs/heads/example-branch', 'Authorize the Github Action with the specified ID to provide Just-in-Time access');
}