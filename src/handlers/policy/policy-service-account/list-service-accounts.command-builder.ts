import yargs from 'yargs';

export type listServiceAccountsArgs =
{json: boolean} &
{detail: boolean};

export function listServiceAccountsCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<listServiceAccountsArgs> {
    return yargs
        .option(
            'json',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'j',
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
        .example('$0 service-account list', 'List all service accounts, as regular table output')
        .example('$0 service-account list --json', 'List all service accounts, output as json, pipeable')
        .example('$0 service-accounts list --detail', 'List all service accounts, show all extra information');
}