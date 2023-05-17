import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { getPostgresServiceName, getPostgresConfigRoot, getOsName } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { TestTarget } from 'system-tests/tests/system-test.types';

/**
 * Prepares a target machine for passwordless access of a postgres database
 * Note that this function assumes there is a tunnel policy set up, and that an ssh config file has been generated
 * @param testTarget the target to configure
 * @param targetName the target's name
 * @param sshConfigFile path to the custom ssh config
 * @param localConfigDir path to the configuration files to copy up
 * @param certDir path to the certificate files to copy up
 */
export async function configurePostgres(testTarget: TestTarget, targetName: string, sshConfigFile: string, localConfigDir: string, certDir: string) {
    const sshOptions = `-F ${sshConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no`;
    const configRoot = getPostgresConfigRoot(testTarget.dropletImage);
    const pgConfigScript = path.join(localConfigDir, 'configure-pg.sh');
    const pgConfigFile = path.join(localConfigDir, `postgresql-${getOsName(testTarget.dropletImage)}.conf`);
    const pexec = promisify(exec);

    // place the OS-specific config file on the target
    let command = `scp ${sshOptions} ./${pgConfigFile} root@${targetName}:${configRoot}/postgresql.conf`;
    await pexec(command);

    // place the access control file on the target
    command = `scp ${sshOptions} ./${path.join(localConfigDir, 'pg_hba.conf')} root@${targetName}:${configRoot}/pg_hba.conf`;
    await pexec(command);

    // execute script that initializes the files required by the agent
    command = `ssh ${sshOptions} root@${targetName} "bash -s" < ${pgConfigScript} "${configRoot}"`;
    await pexec(command);

    // place the certificate and additional files in the directory we just created
    command = `scp ${sshOptions} ${certDir}/* root@${targetName}:${configRoot}/pgconf`;
    await pexec(command);

    // restart postgres
    command = `ssh ${sshOptions} root@${targetName} systemctl restart ${getPostgresServiceName(testTarget.dropletImage)}`;
    await pexec(command);
}

