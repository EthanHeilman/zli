import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import yargs from 'yargs';
import { createApiKeyArgs } from 'handlers/api-key/create-api-key.command-builder';
import { ApiKeyHttpService } from 'http-services/api-key/api-key.http-services';
import { cleanExit } from 'handlers/clean-exit.handler';

export async function createApiKeyHandler(
    argv: yargs.Arguments<createApiKeyArgs>,
    logger: Logger,
    configService: ConfigService,
) {
    const apiKeyService = await ApiKeyHttpService.init(configService, logger);
    const createResp = await apiKeyService.CreateNewApiKey({ name: argv.name, isRegistrationKey: argv.registrationKey });

    if (argv.json) {
        console.log(JSON.stringify(createResp));
    } else {
        logger.info(`Created API key with name: ${createResp.apiKeyDetails.name}`);
        logger.info(`ID: ${createResp.apiKeyDetails.id}`);
        logger.info(`Secret: ${createResp.secret}`);
        logger.info('\nPlease write your secret down. It cannot be recovered later.');
    }

    await cleanExit(0, logger);
}