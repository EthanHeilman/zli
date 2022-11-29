import yargs from 'yargs';

export type disableServiceAccountArgs =
{serviceAccountEmail: string};

export function disableServiceAccountCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<disableServiceAccountArgs> {
    return yargs
        .positional('serviceAccountEmail',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .example('$0 service-account disable cool-service-account-email', 'Disable service account cool-service-account-email. Applicable only if previously enabled.');
}