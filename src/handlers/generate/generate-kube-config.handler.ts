import yargs from 'yargs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { generateKubeConfigArgs } from './generate-kube.command-builder';
import k8s, { KubeConfig } from '@kubernetes/client-node';
import { exportKubeConfigToYaml, updateKubeConfigWith, generateKubeConfig, getKubeDaemonSecuritySettings, mergeKubeConfig, updateUserKubeConfigWith, filterAndOverwriteUserKubeConfig, IFilterKubeConfigService } from '../../services/kube-management/kube-management.service';
import { getAllRunningDaemons, IDaemonStatusRetriever, newKubeDaemonManagementService } from '../../services/daemon-management/daemon-management.service';
import { KubeConfig as ZliKubeConfig, KubeDaemonSecurityConfig } from '../../services/config/config.service.types';
import { ILogger } from '../../../webshell-common-ts/logging/logging.types';
import { handleDisconnect, IDaemonDisconnector } from '../disconnect/disconnect.handler';

export async function generateKubeConfigHandler(
    argv: yargs.Arguments<generateKubeConfigArgs>,
    configService: ConfigService,
    logger: Logger
) {
    // Check if we already have generated global security settings for kube
    // daemons
    const kubeSecurityConfig = await getKubeDaemonSecuritySettings(configService, logger, argv.force);

    const kubeDaemonManagementService = newKubeDaemonManagementService(configService);
    const generatedKubeConfigAsYaml = await handleGenerateKubeConfig(
        argv,
        kubeSecurityConfig,
        kubeDaemonManagementService,
        configService,
        logger
    );

    if (generatedKubeConfigAsYaml)
        console.log(generatedKubeConfigAsYaml);
}

export interface IGenerateKubeConfigManagementService extends IDaemonDisconnector<ZliKubeConfig>, IDaemonStatusRetriever<ZliKubeConfig> {
    getDaemonConfigs(): Map<string, ZliKubeConfig>;
}

/**
 * Generate kube config
 * @returns Generated kube config in YAML format, if arguments don't specify to
 * write to disk. Otherwise, null
 */
export async function handleGenerateKubeConfig(
    argv: generateKubeConfigArgs,
    kubeSecurityConfig: KubeDaemonSecurityConfig,
    managementService: IGenerateKubeConfigManagementService,
    configService: IFilterKubeConfigService,
    logger: ILogger
) : Promise<string> {

    // Disconnect any running daemons if force flag passed
    if (argv.force) {
        const runningDaemons = await getAllRunningDaemons(managementService);
        if (runningDaemons.length > 0) {
            logger.warn('Disconnecting your existing kube daemons due to generating new security settings. Please re-connect to your kube targets.');
            await handleDisconnect(managementService, logger);
            // Filter stale bzero entries from user's kube config
            await filterAndOverwriteUserKubeConfig(configService, logger);
        }
    }

    const kubeDaemonConfigs = managementService.getDaemonConfigs();

    // The master kube config to write to disk
    let rollingKubeConfig: k8s.KubeConfig = new KubeConfig();

    // Add to rolling config a context and cluster entry for every daemon config
    // stored in our config.
    for (const [_, kubeDaemonConfig] of kubeDaemonConfigs) {
        const generatedKubeConfig = generateKubeConfig(
            configService,
            kubeDaemonConfig.targetCluster,
            kubeDaemonConfig.targetUser,
            kubeDaemonConfig.localPort,
            kubeSecurityConfig.token,
            kubeDaemonConfig.defaultNamespace
        );

        // Merge generated config with rolling config
        rollingKubeConfig = mergeKubeConfig(rollingKubeConfig, generatedKubeConfig);
    }

    // Note: If there are daemon configs, then current-context is set to the
    // last target in that list (should be the last connected target)

    // Following aws CLI update-kubeconfig semantics, we respect the following
    // order when writing kube config to disk:
    // (1): CLI argument (--outputFile)
    // (2): KUBECONFIG environment variable
    // (3): Default filepath in user's home directory (~/.kube/config)
    // Source: https://github.com/aws/aws-cli/blob/e5422b70e90804480363a5a0b4893059e8798a44/awscli/examples/eks/update-kubeconfig/_description.rst

    // Show it to the user or write to file
    if (argv.outputFile) {
        await updateKubeConfigWith(rollingKubeConfig, argv.outputFile);
        return null;
    } else if (argv.update) {
        await updateUserKubeConfigWith(rollingKubeConfig);
        logger.info('Updated existing kube config!');
        return null;
    } else {
        const rollingKubeConfigAsYAML = exportKubeConfigToYaml(rollingKubeConfig);
        return rollingKubeConfigAsYAML;
    }
}