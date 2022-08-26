import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfTargetGroups } from '../../utils/utils';
import yargs from 'yargs';
import { ServiceAccountHttpService } from '../../http-services/service-account/service-account.http-services';
import { createServiceAccountArgs } from '../../handlers/service-account/create-service-account.command-builder';
// import { base64 } from 'encoding/base64';




export async function createServiceAccount(configService: ConfigService, logger: Logger, argv : yargs.Arguments<createServiceAccountArgs>) {

    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
    var jwksURL = "https://www.googleapis.com/service_accounts/v1/jwk/"+argv.email;
    var encodedjwksUrl = Buffer.from(jwksURL).toString('base64');
    

    const createResp = await serviceAccountHttpService.CreateServiceAccount({email: encodedjwksUrl});
    console.log("Created service account: ", argv.email, "\n with JWKS uri: ", jwksURL);

}