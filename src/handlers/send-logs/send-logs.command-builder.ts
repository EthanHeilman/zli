import yargs from 'yargs';

export type sendLogsArgs =
{target: string} &
{all: string};

export function sendLogsCmdBuilder(yargs : yargs.Argv<{}>) : yargs.Argv<sendLogsArgs> {
    return yargs
        .option('target',
            {
                type: 'string',
                demandOption: false,
                requiresArg: true,
                description: 'Send only agent logs',
                alias: 't'
            }
        )
        .option('all',
            {
                type: 'string',
                demandOption: false,
                requiresArg: true,
                description: 'Send zli, daemon, and agent logs',
                alias: 'a'
            }
        ).conflicts('target', 'all')
        .example('$0 send-logs', 'Send only zli and daemon logs to BastionZero')
        .example('$0 send-logs --target target-name/id', 'Send only target logs to BastionZero')
        .example('$0 send-logs --all target-name/id', 'Send zli, daemon and target logs to BastionZero');
}
