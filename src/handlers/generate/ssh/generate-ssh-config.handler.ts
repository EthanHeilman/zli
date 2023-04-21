import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { SshTargetsResponse } from '../../../../webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { buildSshConfigStrings } from './generate-ssh-proxy.handler';
import { generateSshConfigArgs } from './generate-ssh-config.command-builder';
import { cleanExit } from '../../clean-exit.handler';

// bound refers to star boundaries set for the comments
const bound = '*'.repeat(80);
const includeStmtDes = `# Please read the config file below for additional information
# regarding the use of the BastionZero SSH configuration file.
`;
const note = `# Note: no changes, other than this insertion, have been made to your
# existing configuration.
#${bound}
`;

/**
 * Generates an ssh config file based on tunnel targets the user has access to, then Includes it
 * in the user's existing ssh config file
 * @param configService {ConfigService}
 * @param logger {Logger}
 * @param processName {string} the calling process (e.g., "zli"), used to populate the ProxyCommand
 */
export async function generateSshConfigHandler(argv: yargs.Arguments<generateSshConfigArgs>, configService: ConfigService, logger: Logger, processName: string) {
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const sshTargets: SshTargetsResponse[] = await policyQueryHttpService.GetSshTargets();

    // If current user has tunnel or file transfer access then create file
    // Otherwise, raise error that user does not have correct access to any targets
    if(sshTargets.length > 0) {
        // Build our ssh config file -- note that by using this function with 'true' we are chosing to add the prefix before our hostname token in the proxycommand
        const { identityFile, knownHostsFile, proxyCommand, prefix } = await buildSshConfigStrings(configService, processName, logger, true);
        // here we set it to false to get the special case of the wildcard proxyCommand, which shouldn't have a prefix
        const { proxyCommand: proxyWithoutPrefix } = await buildSshConfigStrings(configService, processName, logger, false);
        const bzConfigContentsFormatted = formatBzConfigContents(configService, sshTargets, identityFile, knownHostsFile, proxyCommand, proxyWithoutPrefix, prefix);
        // Determine the user's ssh and bzero-ssh config path
        const { userConfigPath, bzConfigPath } = getSshConfigPaths(argv.mySshPath, argv.bzSshPath, prefix);

        // write to the user's ssh and bzero-ssh config path
        fs.mkdirSync(path.dirname(bzConfigPath), { recursive:true });
        fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);

        // Link the ssh config path, with our new bzero-ssh config path
        // Also include an introductory statement
        linkNewConfigFile(userConfigPath, bzConfigPath, logger);
        logger.info(`SSH configuration generated successfully! For a list of reachable targets, see ${bzConfigPath}`);
    } else {
        // Build our ssh config file -- note that by using this function with 'true' we are chosing to add the prefix before our hostname token in the proxycommand
        const { prefix } = await buildSshConfigStrings(configService, processName, logger, true);
        // Determine the user's ssh and bzero-ssh config path
        const { userConfigPath, bzConfigPath } = getSshConfigPaths(argv.mySshPath, argv.bzSshPath, prefix);

        deleteBzConfigContents(userConfigPath, bzConfigPath, logger);
        logger.info('You do not have tunnel or file transfer access to any targets. BZ SSH configuration file not generated.');
    }

    await cleanExit(0, logger);
}

/**
 * Use default filepaths unless user provided some at the CLI
 * @param userSshPath {string} path to the user's ssh config file
 * @param bzSshPath {string} path to the bz config file
 * @param configPrefix {string} assigns a prefix to the bz config filename based on runtime environment (e.g. dev, stage)
 * @returns {{userConfigPath: string, bzConfigPath: string}}
 */
export function getSshConfigPaths(userSshPath: string, bzSshPath: string, configPrefix: string) {
    const homedir = (process.platform === 'win32') ? process.env.HOMEPATH : process.env.HOME;

    const userConfigPath = userSshPath ? userSshPath : path.join(homedir, '.ssh', 'config');
    const bzConfigPath = bzSshPath ? bzSshPath : path.join(homedir, '.ssh', `${configPrefix}bz-config`);

    return { userConfigPath, bzConfigPath };
}

/**
 * Given some config information, produces a valid SSH config string
 * @param sshTargets {SshTargetsResponse[]} A list of targets the user can access over SSH tunnel
 * @param identityFile {string} A path to the user's key file
 * @param knownHostsFile {string} A path to the user's known_hosts file
 * @param proxyCommand {string} A proxy command routing SSH requests to the ZLI
 * @param proxyWildcard {string} A proxy command specific to the wildcard entry
 * @param configPrefix {string} assigns a prefix to the bz config filename based on runtime environment (e.g. dev, stage)
 * @returns {string} the bz config file contents
 */
function formatBzConfigContents(configService: ConfigService, sshTargets: SshTargetsResponse[], identityFile: string, knownHostsFile: string, proxyCommand: string, proxyWildcard: string, configPrefix: string): string {
    let contents = `#${bound}
#
# BastionZero auto-generated SSH configuration file
#
# This file is auto-generated based on your SSH policy as specified by the
# administrator(s) of your BastionZero account.
#
# All SSH connections are secured through the BastionZero ZLI, ensuring you are secured
# with our multi-root, trustless access protocol (MrTAP).
#
# This file includes the following:
#
# If you have a target access / SSH policy, you may use SSH
# to any host within that policy by using the format:
#
# ssh targetUser@bzero-targetHostname
#
# This will proxy the SSH connection through BastionZero as the 'bzero-' wildcard will
# match the proxy entry below.
#
# BastionZero makes specific use of the %n and %s in our configuration statements
# below. %n will pass and proxy the host name as the entry exists. %s will convert it to
# lowercase. Please be cautious if changing these values.
#
# Users
# -----
# If your administrator has provided SSH access with more than one target user, the
# full list has been provided in a comment under the host. To set a default simply
# add the appropriate user line by copying and modifying the line. For example:
#
# # User postgres, centos, user1, ec2-user
#
# Becomes:
#
# # User postgres, centos, user1, ec2-user
# User ec2-user
#
# Target Names
# ------------
# Each host name is formatted in two ways: 
# 1. <target name> and
# 2. <target name>.<environment name>
# This allows you to connect based on environment name for targets that 
# may share the same name.
#
#${bound}
`;

    // add per-target configs
    for(const target of sshTargets) {
        // add user names
        let user = ``;
        if(target.targetUsers.length === 1) {
            user += `User ${target.targetUsers[0].userName}`;
        } else if(target.targetUsers.length > 1) {
            user += `# User `;
            for(const targetUser of target.targetUsers) {
                user += `${targetUser.userName} `;
            }
        }

        // if a default user is set, then override the target user string
        if(configService.getConnectConfig().targetUser) {
            user = `User ${configService.getConnectConfig().targetUser}`;
        }

        if(target.environmentName) {
            contents += `
Host ${target.targetName} ${target.targetName}.${target.environmentName}`;
        } else {
            contents += `
Host ${target.targetName}`;
        }

        contents += `
    ${identityFile}
    ${knownHostsFile}
    ${proxyCommand}
    ${user}
`;
    }

    // Also add our proxy wildcard command
    contents += `
Host ${configPrefix}*
    ${identityFile}
    ${knownHostsFile}
    ${proxyWildcard}
`;

    return contents;
}

/**
 * Attaches an 'Include path/to/bz-config' line to the user's ssh config file, if not there already
 * Also adds an description for the include statement and a note at after the last include statement
 * @param userConfigFile {string} path of the user's config file
 * @param bzConfigFile {string} path of the BZ config file
 * @param logger {Logger}
 */
function linkNewConfigFile(userConfigFile: string, bzConfigFile: string, logger: Logger) {
    const includeStmt = (process.platform === 'win32') ? `Include "${bzConfigFile}"` : `Include ${bzConfigFile}`;

    let configContents: string;
    let userConfigExists = true;
    try {
        configContents = fs.readFileSync(userConfigFile, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            userConfigExists = false;
            configContents = '';
        } else {
            logger.error('Unable to read your ssh config file');
            throw err;
        }
    }

    // if the config file doesn't exist or the include statement
    // isn't present, prepend it to the file with a description
    // append the note if the file does not already contain it
    if (!userConfigExists || !configContents.includes(includeStmt)) {
        let includeContents = `${includeStmtDes}${includeStmt}\n\n`;
        if(!configContents.includes(note)) {
            includeContents += `${note}\n`;
        }
        configContents = includeContents + configContents;
    } else if (configContents.includes(includeStmt)
            && !configContents.includes(includeStmtDes)
            && !configContents.includes(note)) {
        // backwards compatibility for single include statement
        configContents = configContents.replace(`${includeStmt}\n\n`, '');
        configContents = `${includeStmtDes}${includeStmt}\n\n${note}\n` + configContents;
    }

    const fd = fs.openSync(userConfigFile, 'w+');
    fs.writeFileSync(fd, configContents);
    fs.close(fd, () => { });
}

/**
 * Deletes the bz config file and removes its statement and description in user's config file
 * Deletes the note if no include statements are left in the user's config file
 * @param userConfigFile {string} path of the user's config file
 * @param bzConfigFile {string} path of the BZ config file
 * @param logger {Logger}
 */
function deleteBzConfigContents(userConfigFile: string, bzConfigFile: string, logger: Logger) {
    const includeStmt = (process.platform === 'win32') ? `Include "${bzConfigFile}"` : `Include ${bzConfigFile}`;
    const includeStmtWithDes = `${includeStmtDes}${includeStmt}\n\n`;

    let configContents: string;
    try {
        configContents = fs.readFileSync(userConfigFile, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            configContents = '';
        } else {
            logger.error('Unable to read your ssh config file');
            throw err;
        }
    }

    // the user has a config file, then remove the include statement
    // and its description from the file
    // if no bz include statements left, remove the note
    if(userConfigFile) {
        if(configContents.includes(includeStmtWithDes)) {
            configContents = configContents.replace(includeStmtWithDes, '');
        } else if(!configContents.includes(includeStmtDes) && configContents.includes(includeStmt)) {
            // backwards compatibility for single include statement
            configContents = configContents.replace(`${includeStmt}\n\n`, '');
        } else if(!configContents.includes(includeStmt)) {
            logger.info('No action has been taken.');
        }

        // only the note exists here and no include statements that we added
        if(configContents.includes(note) && !configContents.includes('BastionZero SSH configuration')) {
            configContents = configContents.replace(`${note}\n`, '');
        }

        const fd = fs.openSync(userConfigFile, 'w+');
        fs.writeFileSync(fd, configContents);
        fs.close(fd, () => { });
    }

    // delete the bz config file if it exists
    try {
        fs.rmSync(bzConfigFile, {force:true});
    } catch(err) {
        if(err.code !== 'ENOENT') {
            console.error(err);
        }
    }
}
