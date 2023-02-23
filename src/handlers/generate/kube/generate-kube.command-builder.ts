import yargs from 'yargs';

export type generateKubeArgs = {outputFile: string};

function generateKubeCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeArgs> {
    return yargs
        .option('outputFile', {
            type: 'string',
            demandOption: false,
            alias: 'o',
            default: null,
            description: 'Specifies a file path to write the generated configuration to'
        });
}

export type generateKubeYamlArgs = generateKubeArgs
& {labels: string[]}
& {namespace: string}
& {environmentName: string }
& {clusterName: string};

export function generateKubeYamlCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeYamlArgs> {
    return generateKubeCmdBuilder(yargs)
        .positional('clusterName', {
            type: 'string',
            default: null
        })
        .option('namespace', {
            type: 'string',
            default: '',
            demandOption: false,
            description: 'Sets the namespace for all bctl-agent-related Kubernetes objects'
        })
        .option('labels', {
            type: 'array',
            default: [],
            demandOption: false,
            description: 'Adds Kubernetes labels to the bctl-agent deployment'
        })
        .option('environmentName', {
            type: 'string',
            default: null,
            description: 'Sets the BastionZero environment this cluster should be added to'
        })
        .example('$0 generate kubeYaml testcluster', '')
        .example('$0 generate kubeYaml testcluster --labels testkey:testvalue', '');
}

export type generateKubeConfigArgs = generateKubeArgs
& {update: boolean} & {force: boolean};

export function generateKubeConfigCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeConfigArgs> {
    return generateKubeCmdBuilder(yargs)
        .option('update', {
            type: 'boolean',
            default: false,
            description: 'Updates the user\'s existing kubeconfig file'
        })
        .option('force', {
            type: 'boolean',
            default: false,
            description: 'Force generates new Kube daemon security settings. WARNING: Disconnects any running Kube daemons'
        })
        .example('$0 generate kubeConfig', '')
        .example('$0 generate kubeConfig --update', 'Update existing kube config (defaults KUBECONFIG to $HOME/.kube/config)');
}