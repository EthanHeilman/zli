import yargs from 'yargs';

export type addSubjectArgs =
{policyName: string} &
{email: string};

export function addSubjectToPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<addSubjectArgs> {
    return yargs
        .positional('policyName',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .positional('email',
            {
                type: 'string',
                default: null,
                demandOption: true,
                description: 'The email of the user or service account that will be added to the policy'
            }
        )
        .example('$0 policy add-subject cool-policy subject-email', 'Add the subject (user or service account) subject-email to the cool-policy policy');
}