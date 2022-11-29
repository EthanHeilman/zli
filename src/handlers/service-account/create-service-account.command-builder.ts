import yargs from 'yargs';

export const bzeroCredsDefaultPath : string = './bzero-credentials.json';

export type createServiceAccountArgs =
{providerCreds: string} &
{bzeroCreds: string};

export function createServiceAccountCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<createServiceAccountArgs>
{
    return yargs
        .positional(
            'providerCreds',
            {
                type: 'string',
                demandOption: true,
            }
        )
        .option(
            'bzeroCreds',
            {
                type: 'string',
                demandOption: false,
                default: bzeroCredsDefaultPath,
                alias: 'bc',
                describe: 'The file path to output the service account BastionZero credentials'
            }
        )
        .example('$0 service-account create cool-service-account.json', 'Create a new service account based off the provider credentials in cool-service-account.json and output a bzero-credentials.json file in the current directory')
        .example('$0 service-account create cool-service-account.json --bzeroCreds /mySecureFolder/my-bzero-creds.json', 'Create a new service account based off the provider credentials in cool-service-account.json and output a my-bzero-creds.json file in the mySecureFolder directory');
}