import { SubjectHttpService } from '../../../src/http-services/subject/subject.http-services';
import { ConfigService } from '../../../src/services/config/config.service';
import { SubjectType } from '../../../webshell-common-ts/http/v2/common.types/subject.types';
import yargs from 'yargs';
import { Logger } from '../../../src/services/logger/logger.service';
import { serviceAccountSetRoleArgs } from './set-role-service-account.command-builder';
import { parseSubjectRole } from '../../../src/utils/utils';
import { SubjectRole } from '../../../webshell-common-ts/http/v2/subject/types/subject-role.types';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function serviceAccountSetRoleCmdHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<serviceAccountSetRoleArgs>) {
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

    const parsedSubjectRole = parseSubjectRole(argv.role);

    if(subjectSummary.isAdmin &&  parsedSubjectRole === SubjectRole.Admin ||
       !subjectSummary.isAdmin && parsedSubjectRole === SubjectRole.User)
    {
        throw new Error(`The provided subject ${argv.serviceAccountEmail}'s role is already ${argv.role}.`);
    }

    await subjectHttpService.UpdateSubjectRole(subjectSummary.id, {role: parsedSubjectRole });

    logger.info(`Successfully updated role of service account ${subjectSummary.email}`);
}