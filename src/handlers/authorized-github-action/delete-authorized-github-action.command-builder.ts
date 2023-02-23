import yargs from 'yargs';

export type deleteAuthorizedGithubActionArgs = { githubActionId: string };

export function deleteAuthorizedGithubActionCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<deleteAuthorizedGithubActionArgs> {
    return yargs
        .positional(
            'githubActionId',
            {
                nargs: 1,
                type: 'string',
                demandOption: true,
                describe: 'The Github ID of the action to be deleted'
            }
        )
        .example('$0 authorized-action delete repo:mygithuborg/example-repo:ref:refs/heads/example-branch', 'Delete the authorized Github Action with the specified ID');
}