import yargs from 'yargs';

type describeClusterPolicyArgs = {clusterName : string};

export function describeClusterPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<describeClusterPolicyArgs> {
    return yargs
        .positional('clusterName', {
            type: 'string',
        })
        .example('$0 policy describe-cluster-policy test-cluster', 'List all existing policies for test-cluster, as regular table output');
}