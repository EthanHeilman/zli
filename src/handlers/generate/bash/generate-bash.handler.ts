import fs from 'fs';
import util from 'util';
import yargs from 'yargs';
import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import { getAutodiscoveryScript } from 'http-services/auto-discovery-script/auto-discovery-script.http-services';
import { generateBashArgs } from 'handlers/generate/bash/generate-bash.command-builder';
import { getEnvironmentFromName } from 'utils/utils';
import { ScriptTargetNameOption } from 'webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { cleanExit } from 'handlers/clean-exit.handler';

export async function generateBashHandler(
    argv: yargs.Arguments<generateBashArgs>,
    configService: ConfigService,
    logger: Logger
) {
    let scriptTargetNameOption: ScriptTargetNameOption;

    // Construct EnvironmentHttpService
    const envHttpService = await EnvironmentHttpService.init(configService, logger);

    // Retrieve all environments
    const environments = await envHttpService.ListEnvironments();

    switch (argv.targetNameScheme) {
    case 'do':
        scriptTargetNameOption = ScriptTargetNameOption.DigitalOceanMetadata;
        break;
    case 'aws':
        scriptTargetNameOption = ScriptTargetNameOption.AwsEc2Metadata;
        break;
    case 'time':
        scriptTargetNameOption = ScriptTargetNameOption.Timestamp;
        break;
    case 'hostname':
        scriptTargetNameOption = ScriptTargetNameOption.BashHostName;
        break;
    default:
        // Compile-time exhaustive check
        // See: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
        const _exhaustiveCheck: never = argv.targetNameScheme;
        return _exhaustiveCheck;
    }

    // Ensure that environment name argument is valid
    const environment = await getEnvironmentFromName(argv.environment, environments, logger);

    const script = await getAutodiscoveryScript(logger, configService, environment.id, scriptTargetNameOption, argv.agentVersion);

    if (argv.outputFile) {
        await util.promisify(fs.writeFile)(argv.outputFile, script);
    } else {
        console.log(script);
    }

    await cleanExit(0, logger);
}