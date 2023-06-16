import yargs from 'yargs';

const connectionTypes = ['shell', 'db', 'rdp', 'sqlserver', 'kube'] as const;
export type ConnectionTypeOption = typeof connectionTypes[number];

export type listConnectionsArgs = {json: boolean} &
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
                description: 'Formats the output in JSON format'
            }
        )
        .option(
            'type',
            {
                demandOption: false,
                choices: connectionTypes,
                alias: 't',
                describe: 'Filters for a specific connection type'
            }
        )
        .example('$0 lc --json', 'List all open shell, db, rdp, sqlserver and kube connections, output as json, pipeable')
        .example('$0 lc -t db', 'List all open db connections');
}