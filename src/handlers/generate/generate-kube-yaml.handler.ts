import util from 'util';
import yargs from 'yargs';
import fs from 'fs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { generateKubeYamlArgs } from './generate-kube.command-builder';
import { getEnvironmentFromName } from '../../utils/utils';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { EnvironmentHttpService } from '../../http-services/environment/environment.http-services';

export async function generateKubeYamlHandler(
    argv: yargs.Arguments<generateKubeYamlArgs>,
    configService: ConfigService,
    logger: Logger
) {
    // First check all the required args
    if (argv.clusterName == null) {
        logger.error('Please make sure you have passed the clusterName positional argument before trying to generate a yaml!');
        await cleanExit(1, logger);
    }

    const outputFileArg = argv.outputFile;

    // Construct KubeHttpService and EnvironmentHttpService
    const kubeHttpService = new KubeHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);

    // Retrieve all environments
    const environments = await envHttpService.ListEnvironments();

    // Format our labels if they exist
    const labels: { [index: string]: string } = {};
    for (const keyValueString of argv.labels) {
        const key = keyValueString.split(':')[0];
        const value = String(keyValueString.split(':')[1]);
        labels[key] = value;
    }

    // If environment has been passed, ensure it's a valid envId
    let environmentId = null;
    if (argv.environmentName != null) {
        const environment = await getEnvironmentFromName(argv.environmentName, environments, logger);
        environmentId = environment.id;
    }

    // Get our kubeYaml
    const kubeYaml = await kubeHttpService.CreateNewAgentToken(argv.clusterName, labels, argv.namespace, environmentId);

    // Show it to the user or write to file
    if (outputFileArg) {
        await util.promisify(fs.writeFile)(outputFileArg, kubeYaml.yaml);
        logger.info(`Wrote yaml to output file: ${outputFileArg}`);
    } else {
        console.log(kubeYaml.yaml);
    }
    await cleanExit(0, logger);
}