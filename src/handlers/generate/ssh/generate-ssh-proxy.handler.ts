import { exec } from 'child_process';
import { cleanExit } from 'handlers/clean-exit.handler';
import { promisify } from 'util';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';

export async function sshProxyConfigHandler(configService: ConfigService, processName: string, logger: Logger) {

    const { identityFile, knownHostsFile, proxyCommand, prefix } = await buildSshConfigStrings(configService, processName, logger);

    logger.info(`
Add the following lines to your ssh config (~/.ssh/config) file:

Host ${prefix}*
  ${identityFile}
  ${knownHostsFile}
  ${proxyCommand}

Then you can use native ssh to connect to any of your ssm targets using the following syntax:

ssh <user>@${prefix}<ssm-target-id-or-name>
`);

    await cleanExit(0, logger);
}

export async function buildSshConfigStrings(configService: ConfigService, processName: string, logger: Logger, addProxyPrefix: boolean = false) {
    const keyPath = configService.getSshKeyPath();
    const keyPathString = (process.platform === 'win32') ? `"${keyPath}"` : `${keyPath}`;

    const identityFile = `IdentityFile ${keyPathString}`;

    const knownHostsPath = configService.getSshKnownHostsPath();
    const knownHostsFile = (process.platform === 'win32') ? `UserKnownHostsFile "${knownHostsPath}"` : `UserKnownHostsFile ${knownHostsPath}`;

    const configName = configService.getConfigName();
    let prefix = 'bzero-';
    let configNameArg = '';
    if (configName != 'prod') {
        prefix = `${configName}-${prefix}`;
        configNameArg = `--configName=${configName}`;
    }

    const hostnameToken = await getHostnameToken(logger);

    const command = (process.platform === 'win32') ? `"${processName}"` : `${processName}`;
    const proxyCommand = `ProxyCommand ${command} ssh-proxy ${configNameArg} -s ${addProxyPrefix ? prefix : ''}${hostnameToken} %r %p ${keyPathString}`;

    return { identityFile, knownHostsFile, proxyCommand, prefix };
}
/**
 * Get either a "%n" or a "%h", depending on user's version of openSSH
 * Referenced via https://github.com/openssh/openssh-portable/compare/V_8_0_P1...V_8_1_P1
* @param {Logger} logger
* @returns {string}
 */
async function getHostnameToken(logger: Logger) {
    const minimumSshVersion = 8.1;
    const pexec = promisify(exec);
    // should be a string like "OpenSSH_8.6p1, LibreSSL 2.8.3"
    const { stderr } = await pexec('ssh -V');
    try {
        // extract the version as a number
        const sshVersion = stderr.split(' ')[0].split('_')[1];
        const versionNumber = parseFloat(sshVersion.split('p')[0]);
        if (versionNumber < minimumSshVersion) {
            logger.warn(`You are using SSH ${versionNumber}, which does not support the "%n" token for case-sensitive hostnames. Using zli as a proxy to targets with mixed-case names may not work`);
            return '%h';
        }
    } catch (err) {
        logger.error(err);
        logger.error(`stderr: ${stderr}`);
        return '%h';
    }
    return '%n';
}