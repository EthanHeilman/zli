import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import yargs from 'yargs';
import { defaultTargetGroupArgs } from 'handlers/default-target-group/default-target-group.command-builder';

export async function defaultTargetGroupHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<defaultTargetGroupArgs>) {
    // Open up our global kube config
    const kubeGlobalConfig = configService.getGlobalKubeConfig();

    // If the user passed the --set arg
    // Yargs does not have an easy way to see if the default value was used: https://github.com/yargs/yargs/issues/513
    if (process.argv.includes('--set')) {
        kubeGlobalConfig.defaultTargetGroups = argv.set;

        configService.setGlobalKubeConfig(kubeGlobalConfig);

        if (argv.set.length == 0) {
            logger.info('Reset default groups to empty');
        } else {
            logger.info(`Updated default groups to: ${argv.set.join(', ')}`);
        }
    } else {
        const currentDefaultGroups = kubeGlobalConfig.defaultTargetGroups;
        logger.info(`Current default group is set to: ${currentDefaultGroups}`);
    }
}