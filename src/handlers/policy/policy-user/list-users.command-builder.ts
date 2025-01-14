import yargs from 'yargs';

export type listUserArgs =
{json: boolean};

export function listUsersCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<listUserArgs> {
    return yargs
        .option(
            'json',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'j',
                description: 'Formats the ouput in JSON format'
            }
        )
        .example('$0 policy users', 'List all users, as regular table output')
        .example('$0 policy users --json', 'List all users, output as json, pipeable');
}