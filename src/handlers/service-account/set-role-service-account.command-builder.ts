import yargs from 'yargs';

export type serviceAccountSetRoleArgs =
{role: string} &
{serviceAccountEmail: string};

export function serviceAccountSetRoleCmdBuilder(yargs: yargs.Argv<{}>, subjectRoleChoices: string[]) : yargs.Argv<serviceAccountSetRoleArgs> {
    return yargs
        .positional('role',
            {
                type: 'string',
                default: null,
                demandOption: true,
                choices: subjectRoleChoices
            }
        )
        .positional('serviceAccountEmail',
            {
                type: 'string',
                default: null,
                demandOption: true,
                description: 'Email of the service account whose role will change'
            }
        )
        .example('$0 service-account set-role admin cool-service-account-email', 'Change the role of service account cool-service-account-email to admin. Allowed only if not an admin already.');
}