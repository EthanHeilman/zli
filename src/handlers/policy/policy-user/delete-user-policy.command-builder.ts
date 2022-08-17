import yargs from 'yargs';

export type deleteUserArgs =
{idpEmail: string} &
{policyName: string};

export function deleteUserFromPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<deleteUserArgs> {
    return yargs
        .positional('idpEmail',
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
        .example('$0 policy delete-user cool-policy user-email', 'Deletes the user user-email to the cool-policy policy');
}