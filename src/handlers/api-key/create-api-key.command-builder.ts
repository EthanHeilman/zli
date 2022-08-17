import yargs from 'yargs';

export type createApiKeyArgs = { name: string } &
{ registrationKey: boolean } &
{ json: boolean };

export function createApiKeyCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<createApiKeyArgs> {
    return yargs
        .positional(
            'name',
            {
                nargs: 1,
                type: 'string',
                demandOption: true,
                describe: 'The name of the API key to create'
            }
        )
        .option(
            'registrationKey',
            {
                type: 'boolean',
                demandOption: false,
                alias: 'r',
                default: false,
                describe: 'Indicates whether this is a registration key'
            }
        )
        .option(
            'json',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'j',
            }
        )
        .example('api-key create my-api-key', 'Creates an API key named "my-api-key"')
        .example('api-key create my-reg-key -r', 'Creates a registration key named "my-reg-key"');
}