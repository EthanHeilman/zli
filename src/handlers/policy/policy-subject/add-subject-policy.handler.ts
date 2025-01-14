import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { editPolicy, getPolicyFromName } from 'services/policy/policy.services';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function addSubjectToPolicyHandler(subjectEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the subject
    const subjectHttpService = new SubjectHttpService(configService, logger);

    let subjectSummary: SubjectSummary = null;
    try {
        subjectSummary = await subjectHttpService.GetSubjectByEmail(subjectEmail);
    } catch (error) {
        logger.error(`Unable to find subject with email: ${subjectEmail}`);
        await cleanExit(1, logger);
    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (policy === null) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    // If this subject exists already
    if (policy.subjects.find(s => (s.type === SubjectType.User || s.type === SubjectType.ServiceAccount) && s.id === subjectSummary.id)) {
        logger.error(`Subject ${subjectEmail} exists already for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then add the subject to the policy
    const subjectToAdd: Subject = {
        id: subjectSummary.id,
        type: subjectSummary.type
    };

    policy.subjects.push(subjectToAdd);

    // And finally update the policy
    await editPolicy(policy, policyHttpService);

    logger.info(`Added ${subjectEmail} to ${policyName} policy!`);
    await cleanExit(0, logger);
}
