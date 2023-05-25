import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { UserHttpService } from 'http-services/user/user.http-services';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { UserSummary } from 'webshell-common-ts/http/v2/user/types/user-summary.types';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { editPolicy, getPolicyFromName } from 'services/policy/policy.services';

export async function addUserToPolicyHandler(userEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the user
    const userHttpService = new UserHttpService(configService, logger);

    let userSummary: UserSummary = null;
    try {
        userSummary = await userHttpService.GetUserByEmail(userEmail);
    } catch (error) {
        throw new Error(`Unable to find user with email: ${userEmail}`);

    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (policy === null) {
        // Log an error
        throw new Error(`Unable to find policy with name: ${policyName}`);
    }

    // If this user exists already
    if (policy.subjects.find(s => s.type === SubjectType.User && s.id === userSummary.id)) {
        throw new Error(`User ${userEmail} exists already for policy: ${policyName}`);
    }

    // Then add the user to the policy
    const subjectToAdd: Subject = {
        id: userSummary.id,
        type: SubjectType.User
    };

    policy.subjects.push(subjectToAdd);

    // And finally update the policy
    await editPolicy(policy, policyHttpService);

    logger.info(`Added ${userEmail} to ${policyName} policy!`);
}
