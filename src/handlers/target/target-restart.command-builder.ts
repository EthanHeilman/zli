import yargs from 'yargs';

export type restartArgs = { targetString: string };

export function targetRestartCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<restartArgs> {
    return yargs
        .positional('targetString', {
            type: 'string',
        })
        .example('$0 target restart target-name/id', 'Restart the bzero agent on any uniquely named target');
}