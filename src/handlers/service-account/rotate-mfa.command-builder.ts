import yargs from 'yargs';
import { bzeroCredsDefaultPath } from 'handlers/service-account/create-service-account.command-builder';

export type rotateMfaArgs =
{serviceAccountEmail: string}  &
{bzeroCreds: string};

export function rotateMfaCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<rotateMfaArgs> {
    return yargs
        .positional('serviceAccountEmail',
            {
                type: 'string',
                default: null,
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
        .example('$0 service-account rotate-mfa cool-service-account-email', 'Rotate the mfa shared secret of service account cool-service-account-email. Outputs a bzero-credentials.json file in the current directory')
        .example('$0 service-account rotate-mfa cool-service-account-email --bzeroCreds /mySecureFolder/my-bzero-creds.json', 'Rotate the mfa shared secret of service account cool-service-account-email. Outputs a my-bzero-creds.json file in the mySecureFolder directory');
}