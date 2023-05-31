import { OAuthService } from 'services/oauth/oauth.service';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';
import { cleanExit } from 'handlers/clean-exit.handler';

export async function oauthMiddleware(configService: ConfigService, logger: Logger) : Promise<void> {

    const oauth = new OAuthService(configService, logger);

    await oauth.getIdTokenAndExitOnError();

    // Ensure that if this is a service account it is enabled
    if(configService.me().type === SubjectType.ServiceAccount) {
        const serviceAccountHttpService = await ServiceAccountHttpService.init(configService, logger);
        const serviceAccount = await serviceAccountHttpService.Me();
        if(!serviceAccount.enabled) {
            logger.error(`Service account ${serviceAccount.email} is not currently enabled.`);
            await cleanExit(1, logger);
        }
    }
}