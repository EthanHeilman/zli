import yargs from 'yargs';

export type addGroupArgs =
{groupName: string} &
{policyName: string};

export function addGroupToPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<addGroupArgs> {
    return yargs
        .positional('groupName',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .positional('policyName',
            {
                type: 'string',
                default: null,
                demandOption: true,
            }
        )
        .example('$0 policy add-group cool-policy engineering-group', 'Adds the engineering-group IDP group to the cool-policy policy');
}