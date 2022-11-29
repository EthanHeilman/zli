import yargs from 'yargs';

export type deleteSubjectArgs =
{email: string} &
{policyName: string};

export function deleteSubjectFromPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<deleteSubjectArgs> {
    return yargs
        .positional('email',
            {
                type: 'string',
                default: null,
                demandOption: true,
                description: 'The email of the user or service account that will be removed from the policy'
            }
        )
        .positional('policyName',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .example('$0 policy delete-subject cool-policy subject-email', 'Deletes the subject (user or service account) subject-email to the cool-policy policy');
}