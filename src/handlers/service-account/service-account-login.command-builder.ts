import yargs from 'yargs';

export type serviceAccountLoginArgs =
{providerCreds: string} &
{bzeroCreds: string};

export function serviceAccountLoginCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<serviceAccountLoginArgs>
{
    return yargs
        .option(
            'providerCreds',
            {
                nargs: 1,
                type: 'string',
                demandOption: true,
                describe: 'The file path to the service account provider credentials'
            }
        )
        .option(
            'bzeroCreds',
            {
                type: 'string',
                demandOption: true,
                alias: 'bc',
                describe: 'The file path to the service account BastionZero credentials'
            }
        )
        .example('$0 service-account login --providerCreds /path/to/providerCreds.json --bzeroCreds /path/to/bzeroCreds.json', 'Login using a service account');
}