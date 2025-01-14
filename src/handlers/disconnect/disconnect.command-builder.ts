import yargs from 'yargs';

export type disconnectArgs = {targetType: string};

export function disconnectCmdBuilder(yargs : yargs.Argv<{}>) : yargs.Argv<disconnectArgs> {
    return yargs
        .positional('targetType', {
            choices: ['kube', 'db', 'web', 'rdp', 'sqlserver', 'all'],
            nargs: 1,
            type: 'string',
            default: 'all',
            requiresArg: false,
        })
        .example('$0 disconnect', 'Disconnect all local Zli Daemons')
        .example('$0 disconnect kube', 'Disconnect Kube local Zli Daemons');
}