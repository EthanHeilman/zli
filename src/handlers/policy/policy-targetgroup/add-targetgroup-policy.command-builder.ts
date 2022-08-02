import yargs from 'yargs';

export type addTargetGroupArgs =
{targetGroup: string} &
{policyName: string};

export function addTargetGroupToPolicyCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<addTargetGroupArgs> {
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
        .example('$0 policy add-targetgroup cool-policy system:masters', 'Adds the system:masters target group to the cool-policy policy');
}