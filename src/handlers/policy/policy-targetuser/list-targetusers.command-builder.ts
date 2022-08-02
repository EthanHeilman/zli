import yargs from 'yargs';

export type listTargetUserArgs =
{policyName: string} &
{json: boolean};

export function listTargetUserCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<listTargetUserArgs> {
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
        .example('$0 policy targetusers cool-policy', 'List all target users for the cool-policy policy, as regular table output')
        .example('$0 policy targetusers cool-policy --json', 'List all target users for the cool-policy policy, output as json, pipeable');
}