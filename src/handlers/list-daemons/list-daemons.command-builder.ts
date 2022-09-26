import yargs from 'yargs';

export type listDaemonsArgs = {targetType: string};

export function listDaemonsCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<listDaemonsArgs> {
    return yargs
        .option('targetType', {
            choices: ['kube', 'db', 'web', 'all'],
            nargs: 1,
            type: 'string',
            default: 'all',
            requiresArg: false,
            description: 'Filters for a specific daemon type'
        })
        .example('$0 ld web', 'Filter for web daemons');
}