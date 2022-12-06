import yargs from 'yargs';

export type registerArgs = { mfaSecret: string };

export function registerCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<registerArgs> {
    return yargs
        .option('mfaSecret', {
            type: 'string',
            demandOption: false,
            requiresArg: true,
            alias: 'm',
            description: `Mfa secret for registration`,
            default: null
        });
}
