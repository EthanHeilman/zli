import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import util from 'util';
import { spawn, exec } from 'child_process';
import { getKubeDaemonSecuritySettings, getPortFromClusterServer, isKubeContextBastionZero, loadUserKubeConfig } from 'services/kube-management/kube-management.service';
import { findRunningDaemonWithPredicate, newKubeDaemonManagementService } from 'services/daemon-management/daemon-management.service';

const { v4: uuidv4 } = require('uuid');
const execPromise = util.promisify(exec);


export async function bctlHandler(configService: ConfigService, logger: Logger, listOfCommands: string[]) {
    // Check if daemon is even running. User's kube context must refer to a
    // cluster entry whose server's port matches one of the running kube daemons
    // in our config, and the context must be a BastionZero context
    const userKubeConfig = await loadUserKubeConfig();
    logger.debug(`Using user kube config located at: ${userKubeConfig.filePath}`);
    const userCurrentContextName = userKubeConfig.kubeConfig.getCurrentContext();
    const userCurrentContext = userKubeConfig.kubeConfig.getContextObject(userCurrentContextName);
    if (!userCurrentContext) {
        throw new Error(`Could not find context entry with name: ${userCurrentContextName}`);
    }

    if (!(await isKubeContextBastionZero(configService, userCurrentContext)) &&
        // TODO-Yuval: Tag this with JIRA ticket to remove this additional check
        // once there are no more legacy kube configs.
        //
        // Handle legacy kube config. The reason this additional check is here,
        // and not in isKubeContextBastionZero(), is because that function is
        // shared with filtering for stale context+cluster entries. I would
        // rather not have that logic apply to legacy kube config because the
        // old user prefix was not explicit enough to BastionZero.
        !userCurrentContext.user.startsWith((await configService.me()).email)) {
        throw new Error(`Current context ${userCurrentContextName} is not a BastionZero context`);
    }
    const userCurrentCluster = userKubeConfig.kubeConfig.getCluster(userCurrentContext.cluster);
    if (!userCurrentCluster) {
        throw new Error(`Could not find cluster entry with name: ${userCurrentContext.cluster}`);
    }
    const kubeDaemonManagementService = newKubeDaemonManagementService(configService);
    const matchingDaemon = await findRunningDaemonWithPredicate(kubeDaemonManagementService, (d => d.config.localPort.toString() === getPortFromClusterServer(userCurrentCluster)));
    if (!matchingDaemon) {
        logger.error(`There is no running daemon that matches your current kube context: ${userCurrentContextName}. Make sure your kube context is correct and that the kube daemon is running! Use \'zli list-daemons kube\' to list your running daemons`);
        await cleanExit(1, logger);
    }

    // Print as what user we are running the command as, and to which container
    logger.info(`Connected as ${matchingDaemon.config.targetUser} to cluster ${matchingDaemon.config.targetCluster}`);

    const kubeSecurityConfig = await getKubeDaemonSecuritySettings(configService, logger);

    // Then get the token
    const token = kubeSecurityConfig.token;

    // Now generate a log id
    const logId = uuidv4();

    // Now build our token
    const kubeArgsString = listOfCommands.join(' ');

    // We use '++++' as a delimiter so that we can parse the engligh command, logId, token in the daemon
    const formattedToken = `${token}++++zli kube ${kubeArgsString}++++${logId}`;

    // Add the token to the args
    let kubeArgs: string[] = ['--token', formattedToken];

    // Then add the extract the args
    kubeArgs = kubeArgs.concat(listOfCommands);

    const kubeCommandProcess = spawn('kubectl', kubeArgs, { stdio: [process.stdin, process.stdout, process.stderr] });

    kubeCommandProcess.on('close', async (code: number) => {
        logger.debug(`Kube command process exited with code ${code}`);

        if (code != 0) {
            // Check if the daemon has quit
            const daemonStatus = await kubeDaemonManagementService.getDaemonStatus(matchingDaemon.connectionId);
            switch (daemonStatus.type) {
            case 'daemon_is_running':
                break;
            case 'daemon_quit_unexpectedly':
            case 'no_daemon_running':
                logger.error(`The kube daemon connected to ${daemonStatus.config.targetCluster} as ${daemonStatus.config.targetUser} has quit unexpectedly`);
                await cleanExit(1, logger);
                break;
            default:
                // Compile-time exhaustive check
                const exhaustiveCheck: never = daemonStatus;
                throw new Error(`Unhandled case: ${exhaustiveCheck}`);
            }

            // Then ensure we have kubectl installed
            try {
                await execPromise('kubectl --help');
            } catch {
                logger.warn('Please ensure you have kubectl installed!');
            }
            await cleanExit(1, logger);
        } else {
            await cleanExit(0, logger);
        }
    });
}