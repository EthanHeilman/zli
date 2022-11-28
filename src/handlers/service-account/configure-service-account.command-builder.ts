import yargs from 'yargs';

export type configureServiceAccountArgs =
{target: string[]} &
{all : boolean} &
{serviceAccount: string};

export function configureServiceAccountCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<configureServiceAccountArgs> {
    return yargs
        .option('target',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 't',
                description: 'BastionZero targets that will be configured'
            }
        )
        .option('all',
            {
                type: 'boolean',
                demandOption: false,
                description: 'Designate that all BastionZero targets should be configured'
            }
        )
        .conflicts('target', 'all')
        .check((argv) => {
            if(!!argv.target || !!argv.all)
                return !!argv.target || !!argv.all;
            throw new Error('Must specify some targets or all of them');
        }
        )
        .option('serviceAccount',
            {
                type: 'string',
                default: null,
                demandOption: true,
                requiresArg: true,
                alias: 'a',
                description: 'Email of the service account whose pattern will added in the targets'
            }
        )
        .example('$0 service-account configure --target my-cool-target --serviceAccount cool-service-account-email', 'Configure agent my-cool-target to allow access to service accounts that follow the jwksUrl pattern of cool-service-account-email.');
}