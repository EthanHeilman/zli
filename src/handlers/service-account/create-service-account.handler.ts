import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import yargs from 'yargs';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';
import { createServiceAccountArgs } from 'handlers/service-account/create-service-account.command-builder';
import fs from 'fs';
import { ServiceAccountProviderCredentials } from 'handlers/login/types/service-account-provider-credentials.types';
import { CreateServiceAccountRequest } from 'webshell-common-ts/http/v2/service-account/requests/create-service-account.requests';
import { checkWritableFilePath, createBzeroCredsFile } from 'utils/utils';

export const GCPJwksURLPrefix = 'https://www.googleapis.com/service_accounts/v1/jwk/';
export const GCPTokenUri = 'https://oauth2.googleapis.com/token';

export async function createServiceAccountHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<createServiceAccountArgs>) {
    const providerCredsFile = JSON.parse(fs.readFileSync(argv.providerCreds, 'utf-8')) as ServiceAccountProviderCredentials;
    await checkWritableFilePath(argv.bzeroCreds, `Failed to create bzeroCreds file at ${argv.bzeroCreds}`);
    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);

    let jwksURL: string;
    // If this is a GCP service account
    if(providerCredsFile.token_uri == GCPTokenUri)
        jwksURL = GCPJwksURLPrefix + providerCredsFile.client_email;
    else {
        // If it is a generic service account, expect jwksUrl/Pattern to be provided
        if(!providerCredsFile.jwksURL || !providerCredsFile.jwksURLPattern) {
            logger.error(`When creating a generic service account a jwksUrl and a jwksURLPattern need to be provider in the provider file.`);
            await cleanExit(1, logger);
        }
        jwksURL = providerCredsFile.jwksURL;
    }

    const serviceAccountEmailParts = providerCredsFile.client_email.split('@');

    if(serviceAccountEmailParts.length != 2){
        logger.error(`The provided email ${providerCredsFile.client_email} is not a valid email.`);
        await cleanExit(1, logger);
    }

    // If this is a GCP service account construct the pattern, else use the provided one
    const jwksURLPattern = providerCredsFile.token_uri == GCPTokenUri ?
        GCPJwksURLPrefix + '*' + serviceAccountEmailParts[1] :
        providerCredsFile.jwksURLPattern;

    const req: CreateServiceAccountRequest = {
        email: providerCredsFile.client_email,
        jwksURL: jwksURL,
        jwksURLPattern: jwksURLPattern,
        externalId: providerCredsFile.client_id
    };
    const resp = await serviceAccountHttpService.CreateServiceAccount(req);
    logger.info(`Successfully created service account ${resp.serviceAccountSummary.email} with JWKS URL ${resp.serviceAccountSummary.jwksUrl}`);
    await createBzeroCredsFile(resp.mfaSecret, configService.me().organizationId, configService.getIdp(), argv.bzeroCreds);
    logger.info('Successfully created the BastionZero credentials of this service account');

    await cleanExit(0, logger);
}