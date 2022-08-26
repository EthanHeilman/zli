import yargs from 'yargs';

export type loginArgs = {mfa: string}

export function loginCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<loginArgs>
{
    return yargs
        .option(
            'mfa',
            {
                type: 'string',
                demandOption: false,
                alias: 'm'
            }
        )
        .example('$0 login --mfa 123456', 'Login and enter MFA');
}

export type serviceAccountLoginArgs = {creds: string}


export function serviceAccountLoginCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<serviceAccountLoginArgs>
{
    return yargs
        .option(
            'creds',
            {
                nargs: 1,
                type: 'string',
                demandOption: true,
                describe: 'The file path to the service accounts credentials'
            }
        )
        .example('$0 service-account-login --creds /path/to/creds.json', 'Login using a service account');
}