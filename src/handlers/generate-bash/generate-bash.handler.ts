import util from 'util';
import fs from 'fs';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { EnvironmentDetails } from '../../services/v1/environment/environment.types';
import { getAutodiscoveryScript } from '../../services/v1/auto-discovery-script/auto-discovery-script.service';
import yargs from 'yargs';
import { generateBashArgs } from './generate-bash.command-builder';
import { TargetName } from '../../../webshell-common-ts/autodiscovery-script/autodiscovery-script.types';
import { getEnvironmentFromName } from '../../../src/utils/utils';
import { EnvironmentSummary } from '../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';

export async function generateBashHandler(
    argv: yargs.Arguments<generateBashArgs>,
    logger: Logger,
    configService: ConfigService,
    environments: Promise<EnvironmentSummary[]>
) {
    let targetName: TargetName;

    if (argv.targetName === undefined) {
        switch (argv.targetNameScheme) {
        case 'do':
            targetName = { scheme: 'digitalocean' };
            break;
        case 'aws':
            targetName = { scheme: 'aws' };
            break;
        case 'time':
            targetName = { scheme: 'time' };
            break;
        case 'hostname':
            targetName = { scheme: 'hostname' };
            break;
        default:
            // Compile-time exhaustive check
            // See: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
            const _exhaustiveCheck: never = argv.targetNameScheme;
            return _exhaustiveCheck;
        }
    } else {
        targetName = { name: argv.targetName, scheme: 'manual' };
    }

    // Ensure that environment name argument is valid
    const envs = await environments;
    const environment = await getEnvironmentFromName(argv.environment, envs, logger);

    const script = await getAutodiscoveryScript(logger, configService, environment.id, targetName, argv.os, argv.agentVersion);

    if (argv.outputFile) {
        await util.promisify(fs.writeFile)(argv.outputFile, script);
    } else {
        console.log(script);
    }
}