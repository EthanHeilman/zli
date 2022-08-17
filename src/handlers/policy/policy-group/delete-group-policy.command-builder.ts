import yargs from 'yargs';

export type deleteGroupArgs =
{groupName: string} &
{policyName: string};

export function deleteGroupFromPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<deleteGroupArgs> {
    return yargs
        .positional('groupName',
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
        .example('$0 policy delete-group cool-policy engineering-group', 'Deletes the engineering-group IDP group from the cool-policy policy');
}