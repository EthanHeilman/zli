import yargs from 'yargs';

export type connectArgs = {targetString: string} & {targetType: string} & {customPort: number} & {targetGroup: string[]}

export function connectCmdBuilder (yargs : yargs.Argv<{}>,targetTypeChoices : string[]) : yargs.Argv<connectArgs>
{
    return yargs
        .positional('targetString', {
            type: 'string',
        })
        .option(
            'targetType',
            {
                type: 'string',
                choices: targetTypeChoices,
                demandOption: false,
                alias: 't'
            },
        ).option('customPort', {
            type: 'number',
            default: -1,
            demandOption: false
        }).option('targetGroup', {
            type: 'array',
            default: [],
            demandOption: false
        }).option('openBrowser', {
            type: 'boolean',
            default: true,
            demandOption: false
        })
        .example('$0 connect target-user@target-name/id', 'Connect to any uniquely named target')
        .example('$0 connect target-user@target-name.environment-name', 'Connect to targets with the same name in different environment by environment name')
        .example('$0 connect target-user@target-name.environment-GUID', 'Connect to targets with the same name in different environment by environment UUID')
        .example('$0 connect ssm-user@neat-target', 'SSM connect example, uniquely named ssm target')
        .example('$0 connect --targetType dynamic ssm-user@my-dat-config', 'DAT connect example with a DAT configuration whose name is my-dat-config')
        .example('$0 connect admin@neat-cluster --targetGroup system:masters', 'Connect to neat-cluster as the admin Kube RBAC user in the system:masters group');
}