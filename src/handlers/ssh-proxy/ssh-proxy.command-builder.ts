import yargs from 'yargs';

type sshProxyArg = { host: string } &
{ user: string } &
{ port: number } &
{ identityFile: string } &
{ internal: boolean }

export function sshProxyCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<sshProxyArg> {
    return yargs
        .positional('host', {
            type: 'string',
        })
        .positional('user', {
            type: 'string',
        })
        .positional('port', {
            type: 'number',
        })
        .positional('identityFile', {
            type: 'string'
        })
        .option('internal', {
            type: 'boolean',
            alias: 'i',
            default: false,
        });
}