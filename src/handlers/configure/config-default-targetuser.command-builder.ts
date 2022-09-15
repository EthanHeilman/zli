import yargs from 'yargs';

export type configDefaultTargetUserArgs =
{targetUser: string} &
{reset: boolean};

export function configDefaultTargetUserCommandBuilder(yargs : yargs.Argv<{}>) : yargs.Argv<configDefaultTargetUserArgs> {
    return yargs
        .positional('targetUser',
            {
                type: 'string',
                demandOption: false,
                description: 'Set a local default target user for shell, ssh, and scp',
            }
        )
        .option('reset',
            {
                type: 'boolean',
                demandOption: false,
                description: 'Reset the local default target user for shell, ssh, and scp',
                alias: 'r'
            }
        ).conflicts('targetUser', 'reset')
        .example('$0 configure defaultTargetUser ec2-user', 'Set ec2-user as a local default target user for shell, ssh, and scp')
        .example('$0 configure defaultTargetUser --reset', 'Removes the local default target user for shell, ssh, and scp');
}