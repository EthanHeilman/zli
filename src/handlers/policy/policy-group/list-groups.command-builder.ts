import yargs from 'yargs';

export type listGroupArgs =
{json: boolean};

export function listGroupsCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<listGroupArgs> {
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
            'verbose',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'v',
            }
        )
        .example('$0 policy groups', 'List all groups, as regular table output')
        .example('$0 policy groups --json', 'List all groups, output as json, pipeable');
}