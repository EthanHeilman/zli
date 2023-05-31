import yargs from 'yargs';

export interface baseCreatePolicyCmdBuilderArgs {
    name: string;
    users: string[];
    subjects: string[];
    groups: string[];
    description: string;
}

export interface createClusterPolicyArgs extends baseCreatePolicyCmdBuilderArgs {
    clusters: string[];
    environments: string[];
    targetUsers: string[];
    targetGroups: string[];
}

export interface createTConnectPolicyArgs extends baseCreatePolicyCmdBuilderArgs {
    targets: string[];
    environments: string[];
    targetUsers: string[];
    verbs: string[];
}

export interface createRecordingPolicyArgs extends baseCreatePolicyCmdBuilderArgs {
    recordInput: boolean;
}

export interface createProxyPolicyArgs extends baseCreatePolicyCmdBuilderArgs {
    targets: string[];
    environments: string[];
    targetUsers: string[];
}

function baseCreatePolicyCmdBuilder(yargs: yargs.Argv<{}>, checkerFunc: (argv: baseCreatePolicyCmdBuilderArgs) => boolean) : yargs.Argv<baseCreatePolicyCmdBuilderArgs> {
    return yargs
        .option('name',
            {
                type: 'string',
                demandOption: true,
                requiresArg: true,
                alias: 'n',
                description: 'Name of the policy. If spaces included, wrap in double quotes.'
            }
        )
        .option('users',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'u',
                description: 'BastionZero IdP users the policy applies to (SSO emails)'
            }
        )
        .option('subjects',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'a',
                description: 'BastionZero subjects (IdP users and service accounts) the policy applies to (SSO emails)'
            }
        )
        .conflicts('users', 'subjects')
        .option('groups',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'g',
                description: 'SSO groups the policy applies to'
            }
        )
        .option('description',
            {
                type: 'string',
                default: null,
                demandOption: false,
                requiresArg: true,
                alias: 'd',
                description: 'Policy description. Wrap this sentence in double quotes.'
            }
        )
        .check((argv) => checkerFunc(argv), false);
}

export function createClusterPolicyCmdBuilder(yargs: yargs.Argv<{}>, checkerFunc: (argv: baseCreatePolicyCmdBuilderArgs) => boolean) : yargs.Argv<createClusterPolicyArgs> {
    return baseCreatePolicyCmdBuilder(yargs, checkerFunc)
        .option('clusters',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'c',
                description: 'Clusters the policy applies to'
            }
        )
        .option('environments',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'e',
                description: 'Environments the policy applies to'
            }
        )
        .conflicts('clusters', 'environments')
        .option('targetUsers',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                description: 'Allowed target users for the policy'
            }
        )
        .option('targetGroups',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                description: 'Allowed target groups for the policy'
            }
        )
        .example('$0 policy create-cluster -n policy_name -u user@random.com -c test_cluster --targetUsers ec2-user', 'Create a new cluster policy with the specified args');
}

export function createTConnectPolicyCmdBuilder(yargs: yargs.Argv<{}>, verbTypeChoices: string[], checkerFunc: (argv: baseCreatePolicyCmdBuilderArgs) => boolean) : yargs.Argv<createTConnectPolicyArgs> {
    return baseCreatePolicyCmdBuilder(yargs, checkerFunc)
        .option('targets',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 't',
                description: 'Targets the policy applies to (ssm, bzero, and dynamic targets)'
            }
        )
        .option('environments',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'e',
                description: 'Environments the policy applies to'
            }
        )
        .conflicts('targets', 'environments')
        .option('targetUsers',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                description: 'Allowed target users for the policy'
            }
        )
        .option('verbs',
            {
                type: 'string',
                array: true,
                choices: verbTypeChoices,
                demandOption: true,
                requiresArg: true,
                alias: 'v',
                description: 'Actions permitted by the policy'
            }
        )
        .example('$0 policy create-tconnect -n policy_name -u user@random.com -t bzero-target --targetUsers ec2-user -v shell tunnel', 'Create a new target connect policy with the specified args');
}

export function createRecordingPolicyCmdBuilder(yargs: yargs.Argv<{}>, checkerFunc: (argv: baseCreatePolicyCmdBuilderArgs) => boolean) : yargs.Argv<createRecordingPolicyArgs> {
    return baseCreatePolicyCmdBuilder(yargs, checkerFunc)
        .option('recordInput',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                requiresArg: true,
                alias: 'r',
                description: 'Indicates whether input should be recorded. Anything but "true" will be false.'
            }
        )
        .example('$0 policy create-recording -n policy_name -u user@random.com -g Engineering Legal -r true', 'Create a new session recording policy with the specified args');
}

export function createProxyPolicyCmdBuilder(yargs: yargs.Argv<{}>, checkerFunc: (argv: baseCreatePolicyCmdBuilderArgs) => boolean) : yargs.Argv<createProxyPolicyArgs> {
    return baseCreatePolicyCmdBuilder(yargs, checkerFunc)
        .option('targets',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 't',
                description: 'Targets the policy applies to (db or web targets)'
            }
        )
        .option('environments',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                alias: 'e',
                description: 'Environments the policy applies to'
            }
        )
        .option('targetUsers',
            {
                type: 'string',
                array: true,
                demandOption: false,
                requiresArg: true,
                description: 'Allowed target users for the policy -- only used by SplitCert connections; otherwise will be ignored'
            }
        )
        .conflicts('targets', 'environments')
        .example('$0 policy create-proxy -n policy_name -u user@random.com -g Engineering Legal -t target1 target2', 'Create a new proxy policy with the specified args')
        .example('$0 policy create-proxy -n policy_name -u user@random.com -e Default --targetUsers admin', 'Create a new proxy policy for targets in the Default environment. SplitCert targets can be accessed as the admin user');
}
