import yargs from 'yargs';

export type listTargetGroupArgs =
{policyName: string} &
{json: boolean};

export function listTargetGroupsCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<listTargetGroupArgs> {
    return yargs
        .positional('policyName',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
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
        .example('$0 policy targetgroups cool-policy', 'List all target groups for the cool-policy policy, as regular table output')
        .example('$0 policy targetgroups cool-policy --json', 'List all target groups for the cool-policy policy, output as json, pipeable');
}