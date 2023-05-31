import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { ConfigService } from 'services/config/config.service';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import yargs from 'yargs';
import { cleanExit } from 'handlers/clean-exit.handler';
import { Logger } from 'services/logger/logger.service';
import { serviceAccountSetRoleArgs } from 'handlers/service-account/set-role-service-account.command-builder';
import { parseSubjectRole } from 'utils/utils';
import { SubjectRole } from 'webshell-common-ts/http/v2/subject/types/subject-role.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function serviceAccountSetRoleCmdHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<serviceAccountSetRoleArgs>) {
    const subjectHttpService = await SubjectHttpService.init(configService, logger);
    let subjectSummary: SubjectSummary = null;
    try {
        subjectSummary = await subjectHttpService.GetSubjectByEmail(argv.serviceAccountEmail);
    } catch (error) {
        logger.error(`Unable to find subject with email: ${argv.serviceAccountEmail}`);
        await cleanExit(1, logger);
    }
    if(subjectSummary.type != SubjectType.ServiceAccount)
    {
        logger.error(`The provided subject ${argv.serviceAccountEmail} is not a service account.`);
        await cleanExit(1, logger);
    }

    const parsedSubjectRole = parseSubjectRole(argv.role);

    if(subjectSummary.isAdmin &&  parsedSubjectRole === SubjectRole.Admin ||
       !subjectSummary.isAdmin && parsedSubjectRole === SubjectRole.User)
    {
        logger.error(`The provided subject ${argv.serviceAccountEmail}'s role is already ${argv.role}.`);
        await cleanExit(1, logger);
    }

    await subjectHttpService.UpdateSubjectRole(subjectSummary.id, {role: parsedSubjectRole });

    logger.info(`Successfully updated role of service account ${subjectSummary.email}`);
    await cleanExit(0, logger);
}