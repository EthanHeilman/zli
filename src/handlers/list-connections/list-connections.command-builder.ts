import yargs from 'yargs';

const connectionTypes = ['shell', 'db'] as const;
export type ConnectionTypeOption = typeof connectionTypes[number];

export type listConnectionsArgs = {json: boolean} &
{ verbose: boolean } &
{ type: ConnectionTypeOption };


export function listConnectionsCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<listConnectionsArgs> {
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
        .option(
            'type',
            {
                demandOption: false,
                choices: connectionTypes,
                alias: 't',
                describe: 'Filter for a specific connection type'
            }
        )
        .example('$0 lc --json', 'List all open shell and db connections, output as json, pipeable')
        .example('$0 lc -t db', 'List all open db connections');
}