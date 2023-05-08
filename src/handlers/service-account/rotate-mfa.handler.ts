import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { ServiceAccountHttpService } from '../../../src/http-services/service-account/service-account.http-services';
import { Logger } from '../../../src/services/logger/logger.service';
import { rotateMfaArgs } from './rotate-mfa.command-builder';
import { SubjectHttpService } from '../../../src/http-services/subject/subject.http-services';
import { SubjectType } from '../../../webshell-common-ts/http/v2/common.types/subject.types';
import { MfaHttpService } from '../../../src/http-services/mfa/mfa.http-services';
import { checkWritableFilePath, createBzeroCredsFile } from '../../../src/utils/utils';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function rotateMfaHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<rotateMfaArgs>) {
    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
    const subjectHttpService = new SubjectHttpService(configService, logger);
    const mfaHttpService = new MfaHttpService(configService, logger);

    await checkWritableFilePath(argv.bzeroCreds, `Failed to create bzeroCreds file at ${argv.bzeroCreds}`);

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

    const serviceAccount = await serviceAccountHttpService.GetServiceAccount(subjectSummary.id);
    const newMfaSecret = await mfaHttpService.RotateSecret(serviceAccount.id);
    await createBzeroCredsFile(newMfaSecret, configService.me().organizationId, configService.getIdp(), argv.bzeroCreds);
    logger.info(`Successfully rotated mfa secret and created new BastionZero credentials of service account ${serviceAccount.email}`);
}