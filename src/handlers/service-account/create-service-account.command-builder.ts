import yargs from 'yargs';

export type createServiceAccountArgs = {email: string}

export function serviceAccountsCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<createServiceAccountArgs>
{
    return yargs
        .option(
            'email',
            {
                type: 'string',
                demandOption: true,
                alias: 'e'
            }
        )
        .example('$0 --create-service-account account@example.com', 'Create a new service account');
}