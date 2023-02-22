import yargs from 'yargs';

export type listAuthorizedGithubActionsArgs =
{json: boolean} &
{detail: boolean};

export function listAuthorizedGithubActionsCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<listAuthorizedGithubActionsArgs> {
    return yargs
        .option(
            'json',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'j',
                description: 'Formats the output in JSON format'
            }
        )
        .option(
            'detail',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'd',
                description: 'Returns extra detail in the output'
            }
        )
        .example('$0 authorized-action list', 'List all authorized Github Actions, as regular table output')
        .example('$0 authorized-action list --json', 'List all authorized Github Actions, output as json, pipeable')
        .example('$0 authorized-action list --detail', 'List all authorized Github Actions, show all extra information');
}