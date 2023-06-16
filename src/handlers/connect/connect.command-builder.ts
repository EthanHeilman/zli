import yargs from 'yargs';

export type connectArgs = { targetString: string }
& { targetType: string }
& { customPort: number }
& { targetGroup: string[] }
& { namespace: string }
& { protocol: string };

export function connectCmdBuilder(yargs: yargs.Argv<{}>, targetTypeChoices: string[], verbTypeChoices: string[]): yargs.Argv<connectArgs> {
    return yargs
        .positional('targetString', {
            type: 'string',
        })
        .option('targetType', {
            type: 'string',
            choices: targetTypeChoices,
            demandOption: false,
            alias: 't',
            description: 'Specifies the type of target the connection is for'
        }).option('customPort', {
            type: 'number',
            default: -1,
            demandOption: false,
            description: 'Forces the bctl daemon to run on a specific port'
        }).option('targetGroup', {
            type: 'array',
            default: [],
            demandOption: false,
            description: 'Specifies RBAC groups to impersonate as for Kubernetes connections'
        }).option('openBrowser', {
            type: 'boolean',
            default: true,
            demandOption: false,
            description: 'Specifies whether to open browser for web connections'
        }).option('namespace', {
            type: 'string',
            demandOption: false,
            alias: 'n',
            description: 'Specifies the default namespace to use for Kubernetes connections'
        })
        .option('protocol', {
            type: 'string',
            choices: verbTypeChoices,
            demandOption: false,
            alias: 'p',
            description: 'Specifies the protocol to be taken on the specified target'
        })
        .example('$0 connect target-user@target-name/id', 'Connect to any uniquely named target')
        .example('$0 connect target-user@target-name.environment-name', 'Connect to targets with the same name in different environment by environment name')
        .example('$0 connect target-user@target-name.environment-GUID', 'Connect to targets with the same name in different environment by environment UUID')
        .example('$0 connect ssm-user@neat-target', 'SSM connect example, uniquely named ssm target')
        .example('$0 connect --targetType dynamic ssm-user@my-dat-config', 'DAT connect example with a DAT configuration whose name is my-dat-config')
        .example('$0 connect admin@neat-cluster --targetGroup system:masters', 'Connect to neat-cluster as the admin Kube RBAC user in the system:masters group')
        .example('$0 connect admin@neat-cluster -n qa', 'Connect to neat-cluster as the admin Kube RBAC user and set default namespace to qa')
        .example('$0 connect my-windows-target --protocol rdp', 'Connect to my-rdp-target using RDP');;
}