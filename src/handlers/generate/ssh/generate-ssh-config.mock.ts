import path from 'path';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { ConfigService } from '../../../services/config/config.service';
import { mockTunnelsResponseList } from '../../../utils/unit-test-utils';

export function sshConfigMockSetup(): void {
    // Mock GetTunnels from PolicyQueryHttpService
    jest.spyOn(PolicyQueryHttpService.prototype, 'GetSshTargets').mockImplementation(async () => mockTunnelsResponseList);
    // Mock Config methods used in building ssh config file
    jest.spyOn(ConfigService.prototype, 'getConfigName').mockImplementation(() => 'test-config');
    jest.spyOn(ConfigService.prototype, 'getSshKeyPath').mockImplementation(() => '/test/sshKeyPath');
    jest.spyOn(ConfigService.prototype, 'getSshKnownHostsPath').mockImplementation(() => '/test/knownHosts');
}

const mockBzHelpMessage: string = `#********************************************************************************
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
#********************************************************************************
`;

// Expected BZ config file
export const mockBzSshConfigContents: string = mockBzHelpMessage + `
Host test-target-name
    IdentityFile /test/sshKeyPath
    UserKnownHostsFile /test/knownHosts
    ProxyCommand npm run start ssh-proxy --configName=test-config -s test-config-bzero-%n %r %p /test/sshKeyPath
    User test-user

Host test-config-bzero-*
    IdentityFile /test/sshKeyPath
    UserKnownHostsFile /test/knownHosts
    ProxyCommand npm run start ssh-proxy --configName=test-config -s %n %r %p /test/sshKeyPath
`;

// Expected BZ config file
export const mockBzSshConfigContentsDefaultUser: string = mockBzHelpMessage + `
Host test-target-name
    IdentityFile /test/sshKeyPath
    UserKnownHostsFile /test/knownHosts
    ProxyCommand npm run start ssh-proxy --configName=test-config -s test-config-bzero-%n %r %p /test/sshKeyPath
    User default-user

Host test-config-bzero-*
    IdentityFile /test/sshKeyPath
    UserKnownHostsFile /test/knownHosts
    ProxyCommand npm run start ssh-proxy --configName=test-config -s %n %r %p /test/sshKeyPath
`;

/**
 * This helper function mocks user SSH config files when not supplying and supplying their own bzSshPath, respectively
 * @param withBzSshPathOption Boolean signifying if the option --bzSshPath was used
 */
export function getMockSshConfigContents(withBzSshPathOption: boolean): string {
    const tempDir = (!withBzSshPathOption) ? path.join(__dirname, 'temp-generate-ssh-config-test', '.ssh') : path.join(__dirname, 'temp-generate-ssh-config-test');

    // Default config path
    const expectedBzConfigPathDefault = path.join(tempDir, 'test-config-bzero-bz-config');

    // Config path supplied by user
    const expectedBzConfigPathPassedByUser = path.join(tempDir, 'bzSshPath');

    const includeStmtDes = `# Please read the config file below for additional information
# regarding the use of the BastionZero SSH configuration file.
`;

    const sshPath = (!withBzSshPathOption) ? expectedBzConfigPathDefault : expectedBzConfigPathPassedByUser
    const pathString = (process.platform === 'win32') ? `"${sshPath}"` : `${sshPath}`;
    const includeStmt = `Include ${pathString}\n\n`;

    const note = `# Note: no changes, other than this insertion, have been made to your
# existing configuration.
#********************************************************************************\n
`;

    return includeStmtDes + includeStmt + note;
}