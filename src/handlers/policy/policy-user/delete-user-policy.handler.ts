import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { UserHttpService } from 'http-services/user/user.http-services';
import { UserSummary } from 'webshell-common-ts/http/v2/user/types/user-summary.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { editPolicy, getPolicyFromName } from 'services/policy/policy.services';

export async function deleteUserFromPolicyHandler(userEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the user
    const userHttpService = new UserHttpService(configService, logger);

    let userSummary: UserSummary = null;
    try {
        userSummary = await userHttpService.GetUserByEmail(userEmail);
    } catch (error) {
        logger.error(`Unable to find user with email: ${userEmail}`);
        await cleanExit(1, logger);

    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (!policy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    // If this user does not exist
    if (!policy.subjects.find(s => s.type === SubjectType.User && s.id === userSummary.id)) {
        logger.error(`No user ${userEmail} exists for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // And finally update the policy
    policy.subjects = policy.subjects.filter(s => s.id !== userSummary.id);
    await editPolicy(policy, policyHttpService);

    logger.info(`Deleted ${userEmail} from ${policyName} policy!`);
    await cleanExit(0, logger);
}
