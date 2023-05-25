import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { editPolicy, getPolicyFromName } from 'services/policy/policy.services';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';

export async function deleteSubjectFromPolicyHandler(subjectEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the user
    const subjectHttpService = new SubjectHttpService(configService, logger);

    let subjectSummary: SubjectSummary = null;
    try {
        subjectSummary = await subjectHttpService.GetSubjectByEmail(subjectEmail);
    } catch (error) {
        throw new Error(`Unable to find subject with email: ${subjectEmail}`);
    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (!policy) {
        // Log an error
        throw new Error(`Unable to find policy with name: ${policyName}`);
    }

    // If this subject does not exist
    if (!policy.subjects.find(s => (s.type === SubjectType.User || s.type === SubjectType.ServiceAccount) && s.id === subjectSummary.id)) {
        throw new Error(`No subject ${subjectEmail} exists for policy: ${policyName}`);
    }

    // And finally update the policy
    policy.subjects = policy.subjects.filter(s => s.id !== subjectSummary.id);
    await editPolicy(policy, policyHttpService);

    logger.info(`Deleted ${subjectEmail} from ${policyName} policy!`);
}
