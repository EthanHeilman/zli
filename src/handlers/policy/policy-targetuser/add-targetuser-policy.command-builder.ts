import yargs from 'yargs';

export type addTargetUserArgs =
{targetUser: string} &
{policyName: string};

export function addTargetUserToPolicyCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<addTargetUserArgs> {
    return yargs
        .positional('targetUser',
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
        .example('$0 policy add-targetuser cool-policy centos', 'Adds the centos target user to the cool-policy policy');
}