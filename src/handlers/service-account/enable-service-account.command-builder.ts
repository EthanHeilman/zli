import yargs from 'yargs';

export type enableServiceAccountArgs =
{serviceAccountEmail: string};

export function enableServiceAccountCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<enableServiceAccountArgs> {
    return yargs
        .positional('serviceAccountEmail',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .example('$0 service-account enable cool-service-account-email', 'Enable service account cool-service-account-email. Applicable only if previously disabled.');
}