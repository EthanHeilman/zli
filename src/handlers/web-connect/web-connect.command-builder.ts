import yargs from 'yargs';

export type webConnectArgs = {targetName: string} 

export function webConnectCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<webConnectArgs>
{
    return yargs
        .positional('targetName', {
            type: 'string',
            default: null,
        })
        .example('$0 web-connect grafana', 'Db connect example, uniquely named web grafana');
}