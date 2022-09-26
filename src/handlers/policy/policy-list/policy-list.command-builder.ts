import yargs from 'yargs';

export type policyArgs = {type: string} & {json: boolean};

export function listPoliciesCmdBuilder (yargs : yargs.Argv<{}>, policyTypeChoices : string []) : yargs.Argv<policyArgs> {
    return yargs
        .option(
            'type',
            {
                type: 'string',
                choices: policyTypeChoices,
                alias: 't',
                demandOption: false,
                description: 'Filters for a specific policy type'
            }
        )
        .option(
            'json',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'j',
                description: 'Formats the ouput in JSON format'
            }
        )
        .example('$0 policy list --json', 'List all policies, output as json, pipeable')
        .example('$0 policy list --type kubernetes', 'List all Kubernetes policies, as regular table output');
}