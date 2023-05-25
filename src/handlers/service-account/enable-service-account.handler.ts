import { ConfigService } from 'services/config/config.service';
import yargs from 'yargs';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';
import { Logger } from 'services/logger/logger.service';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { enableServiceAccountArgs } from 'handlers/service-account/enable-service-account.command-builder';
import { UpdateServiceAccountRequest } from 'webshell-common-ts/http/v2/service-account/requests/update-service-account.requests';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function enableServiceAccountHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<enableServiceAccountArgs>) {
    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
    const subjectHttpService = new SubjectHttpService(configService, logger);

    let subjectSummary: SubjectSummary = null;
    try {
        subjectSummary = await subjectHttpService.GetSubjectByEmail(argv.serviceAccountEmail);
    } catch (error) {
        throw new Error(`Unable to find subject with email: ${argv.serviceAccountEmail}`);
    }

    if(subjectSummary.type != SubjectType.ServiceAccount)
    {
        throw new Error(`The provided subject ${argv.serviceAccountEmail} is not a service account.`);
    }
    const request: UpdateServiceAccountRequest = {
        enabled: true
    };
    const serviceAccount = await serviceAccountHttpService.UpdateServiceAccount(subjectSummary.id, request);
    logger.info(`Successfully enabled service account ${serviceAccount.email}`);
}