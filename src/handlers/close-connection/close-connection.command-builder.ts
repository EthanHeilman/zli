import yargs from 'yargs';

const connectionTypes = ['shell', 'db'] as const;
export type ConnectionTypeOption = typeof connectionTypes[number];

export type closeConnectionArgs = {connectionId : string;} &
{all : boolean} &
{ type: ConnectionTypeOption | undefined };

export function closeConnectionCmdBuilder(yargs : yargs.Argv<{}>) : yargs.Argv<closeConnectionArgs> {
    return yargs
        .positional('connectionId', {
            type: 'string',
        })
        .option(
            'all',
            {
                type: 'boolean',
                demandOption: false,
                alias: 'a',
                description: 'Closes all connections'
            }
        )
        .option(
            'type',
            {
                demandOption: false,
                choices: connectionTypes,
                alias: 't',
                describe: 'Filter for specific connection type when using the --all flag',
                implies: 'all'
            }
        )
        .example('$0 close d5b264c7-534c-4184-a4e4-3703489cb917', 'close example, unique connection id')
        .example('$0 close --all', 'close all connections')
        .example('$0 close --all -t shell', 'close all shell connections in cli-space')
        .example('$0 close --all -t db', 'close all db connections');
}