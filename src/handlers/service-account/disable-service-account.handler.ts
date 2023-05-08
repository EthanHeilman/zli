import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { ServiceAccountHttpService } from '../../../src/http-services/service-account/service-account.http-services';
import { Logger } from '../../../src/services/logger/logger.service';
import { SubjectHttpService } from '../../../src/http-services/subject/subject.http-services';
import { SubjectType } from '../../../webshell-common-ts/http/v2/common.types/subject.types';
import { disableServiceAccountArgs } from './disable-service-account.command-builder';
import { UpdateServiceAccountRequest } from '../../../webshell-common-ts/http/v2/service-account/requests/update-service-account.requests';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function disableServiceAccountHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<disableServiceAccountArgs>) {
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
        enabled: false
    };
    const serviceAccount = await serviceAccountHttpService.UpdateServiceAccount(subjectSummary.id, request);
    logger.info(`Successfully disabled service account ${serviceAccount.email}`);
}