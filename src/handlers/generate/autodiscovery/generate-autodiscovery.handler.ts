import fs from 'fs';
import util from 'util';
import yargs from 'yargs';
import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import { generateBashArgs } from 'handlers/generate/autodiscovery/generate-bash.command-builder';
import { getEnvironmentFromName } from 'utils/utils';
import { ScriptTargetNameOption } from 'webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { cleanExit } from 'handlers/clean-exit.handler';
import { generatePwshArgs } from './generate-pwsh.command-builder';
import { AutoDiscoveryScriptHttpService } from 'http-services/auto-discovery-script/auto-discovery-script.http-services';
import { ScriptResponse } from 'webshell-common-ts/http/v2/autodiscovery-script/responses/script.responses';

export async function generateBashHandler(
    argv: yargs.Arguments<generateBashArgs>,
    configService: ConfigService,
    logger: Logger
) {
    let scriptTargetNameOption: ScriptTargetNameOption;
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

    await getAutodiscoveryScript(configService, logger, argv.environment, scriptTargetNameOption, false, argv.beta, argv.outputFile);
}

export async function generatePwshHandler(
    argv: yargs.Arguments<generatePwshArgs>,
    configService: ConfigService,
    logger: Logger
) {
    let scriptTargetNameOption: ScriptTargetNameOption;
    switch (argv.targetNameScheme) {
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

    await getAutodiscoveryScript(configService, logger, argv.environment, scriptTargetNameOption, true, argv.beta, argv.outputFile);
}

async function getAutodiscoveryScript(
    configService: ConfigService,
    logger: Logger,
    environment: string,
    targetNameScheme: ScriptTargetNameOption,
    windows: boolean,
    beta: boolean,
    outputFile: string,
): Promise<void> {
    // Construct EnvironmentHttpService
    const envHttpService = new EnvironmentHttpService(configService, logger);
    // Retrieve all environments
    const environments = await envHttpService.ListEnvironments();
    // Ensure that environment name argument is valid
    const environmentToUse = await getEnvironmentFromName(environment, environments, logger);

    const autodiscoveryService = new AutoDiscoveryScriptHttpService(configService, logger);
    let scriptResponse: ScriptResponse;
    if (windows) {
        scriptResponse = await autodiscoveryService.GetPwshAutodiscoveryScript(targetNameScheme, environmentToUse.id, beta);
    } else {
        scriptResponse = await autodiscoveryService.GetBashAutodiscoveryScript(targetNameScheme, environmentToUse.id, beta);
    }

    if (outputFile) {
        await util.promisify(fs.writeFile)(outputFile, scriptResponse.autodiscoveryScript);
    } else {
        console.log(scriptResponse.autodiscoveryScript);
    }

    await cleanExit(0, logger);
}