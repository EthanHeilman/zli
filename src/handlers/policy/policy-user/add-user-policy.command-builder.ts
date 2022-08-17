import yargs from 'yargs';

export type addUserArgs =
{idpEmail: string} &
{policyName: string};

export function addUserToPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<addUserArgs> {
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
        .example('$0 policy add-user cool-policy user-email', 'Add the user user-email to the cool-policy policy');
}