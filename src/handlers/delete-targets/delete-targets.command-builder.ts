import yargs from 'yargs';

type deleteTargetsArgs = {environmentName : string;}

export function deleteTargetsCmdBuilder(yargs : yargs.Argv<{}>) : yargs.Argv<deleteTargetsArgs> {
    return yargs
        .positional('environmentName', {
            type: 'string',
        })
        .example('$0 delete-targets Default', 'delete targets example, environment name');
}