import yargs from 'yargs';

export type deleteTargetGroupArgs =
{targetGroup: string} &
{policyName: string};

export function deleteTargetGroupFromPolicyCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<deleteTargetGroupArgs> {
    return yargs
        .positional('targetGroup',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .positional('policyName',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .example('$0 policy delete-targetgroup cool-policy system:masters', 'Removes the system:masters target group from the cool-policy policy');
}