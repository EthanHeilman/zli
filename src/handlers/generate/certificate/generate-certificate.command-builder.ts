import yargs from 'yargs';

export type generateCertificateArgs = { targets: string[] } &
{ environment: string } &
{ all: boolean } &
{ selfHosted: boolean } &
{ agentKey: boolean } &
{ outputDir: string } &
{ yes: boolean };

export function generateCertificateCommandBuilder(yargs: yargs.Argv<{}>): yargs.Argv<generateCertificateArgs> {
    return yargs
        .option('targets', {
            type: 'array',
            default: [],
            demandOption: false,
            description: '(list of names or list of IDs) One or more database targets to which the certificate will authenticate.'
        })
        .option('environment', {
            type: 'string',
            default: null,
            demandOption: false,
            description: '(name or ID) If targets are provided, environment is used to disambiguate their names.'
        })
        .option('all', {
            type: 'boolean',
            default: false,
            demandOption: false,
            description: 'if set, the certificate will authenticate to all of your current database targets. If any targets cannot be configured, you will be asked whether to only configure the available targets.',
        })
        .option('selfHosted', {
            type: 'boolean',
            default: false,
            demandOption: false,
            description: 'if set, the server cert and server private key will be returned; you will use these when configuring your database.',
        })
        .option('agentKey', {
            type: 'boolean',
            default: false,
            demandOption: false,
            description: 'if set, returns a copy of the RSA key shard sent to the targets; you can use this data to configure other proxy targets to access the database.',
        })
        .options('outputDir', {
            type: 'string',
            default: null,
            demandOptions: false,
            description: 'Provide a directory into which all output files will be written. If none provided, will create a unique directory in the current working directory.'
        })
        .options('yes', {
            alias: 'y',
            type: 'boolean',
            default: false,
            demandOptions: false,
            description: 'If set along with --all, automatically respond affirmatively if prompted.'
        })
        .example('$0 generate certificate --all --selfHosted', 'Generate a root certificate and configure all available database targets; returns extra data to configure any self-hosted targets')
        .example('$0 generate certificate --targets target1 target2', 'Generate a root certificate and configure target1 and target2');
}