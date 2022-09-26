import yargs from 'yargs';

export type generateSshConfigArgs = { mySshPath: string } &
{ bzSshPath: string };

export function generateSshConfigCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateSshConfigArgs> {
    return yargs
        .option('mySshPath', {
            type: 'string',
            default: null,
            description: 'Specifies an alternate location for user\'s SSH config file'
        })
        .option('bzSshPath', {
            type: 'string',
            default: null,
            description: 'Specifies an alternate location for the BastionZero config file'
        })
        .example('$0 generate sshConfig', 'Create and link an ssh config file based on your organization\'s policies')
        .example('$0 generate sshConfig --mySshPath path/to/config --bzSshPath path/to/bz-config', `Optionally specify filepaths (defaults to ${process.env.HOME}/.ssh/config and ${process.env.HOME}/.ssh/bz-config respectively)`);
}