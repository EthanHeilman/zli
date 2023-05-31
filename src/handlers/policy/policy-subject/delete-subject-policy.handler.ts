import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { editPolicy, getPolicyFromName } from 'services/policy/policy.services';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function deleteSubjectFromPolicyHandler(subjectEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the user
    const subjectHttpService = await SubjectHttpService.init(configService, logger);

    let subjectSummary: SubjectSummary = null;
    try {
        subjectSummary = await subjectHttpService.GetSubjectByEmail(subjectEmail);
    } catch (error) {
        logger.error(`Unable to find subject with email: ${subjectEmail}`);
        await cleanExit(1, logger);
    }

    const policyHttpService = await PolicyHttpService.init(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (!policy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    // If this subject does not exist
    if (!policy.subjects.find(s => (s.type === SubjectType.User || s.type === SubjectType.ServiceAccount) && s.id === subjectSummary.id)) {
        logger.error(`No subject ${subjectEmail} exists for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // And finally update the policy
    policy.subjects = policy.subjects.filter(s => s.id !== subjectSummary.id);
    await editPolicy(policy, policyHttpService);

    logger.info(`Deleted ${subjectEmail} from ${policyName} policy!`);
    await cleanExit(0, logger);
}
