import yargs from 'yargs';

export type deleteTargetUserArgs =
{targetUser: string} &
{policyName: string};

export function deleteTargetUserFromPolicyCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<deleteTargetUserArgs> {
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
        .example('$0 policy delete-targetuser cool-policy admin', 'Removes the admin target user from the cool-policy policy');
}