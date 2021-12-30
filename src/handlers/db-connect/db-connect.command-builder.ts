import yargs from 'yargs';

export type dbConnectArgs = {targetString: string} 

export function dbConnectCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<dbConnectArgs>
{
    return yargs
        .positional('targetString', {
            type: 'string',
            default: null,
        })
        .example('$0 web-connect test', 'Web connect example, uniquely named db target');
}