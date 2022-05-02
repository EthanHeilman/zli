import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { SubjectType } from '../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { PolicyType } from '../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { TargetConnectPolicySummary } from '../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { KubernetesPolicySummary } from '../../../webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { ProxyPolicySummary } from '../../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';

export async function addUserToPolicyHandler(userEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the user
    const userHttpService = new UserHttpService(configService, logger);

    let userSummary: UserSummary = null;
    try {
        userSummary = await userHttpService.GetUserByEmail(userEmail);
    } catch (error) {
        logger.error(`Unable to find user with email: ${userEmail}`);
        await cleanExit(1, logger);

    }

    // Get the existing policy
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubernetesPolicies();
    const targetPolicies = await policyHttpService.ListTargetConnectPolicies();
    const proxyPolicies = await policyHttpService.ListProxyPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);
    const targetPolicy = targetPolicies.find(p => p.name == policyName);
    const proxyPolicy = proxyPolicies.find(p => p.name == policyName);

    if (!kubePolicy &&
        !targetPolicy &&
        !proxyPolicy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Assign to policy whichever of the three policies is not null
    const policy = proxyPolicy ? proxyPolicy :
        kubePolicy ? kubePolicy : targetPolicy;

    // If this user exists already
    if (policy.subjects.find(s => s.type === SubjectType.User && s.id === userSummary.id)) {
        logger.error(`User ${userEmail} exists already for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then add the user to the policy
    const subjectToAdd: Subject = {
        id: userSummary.id,
        type: SubjectType.User
    };

    policy.subjects.push(subjectToAdd);

    switch (policy.type) {
    case PolicyType.TargetConnect:
        await policyHttpService.EditTargetConnectPolicy(policy as TargetConnectPolicySummary);
        break;
    case PolicyType.Kubernetes:
        await policyHttpService.EditKubernetesPolicy(policy as KubernetesPolicySummary);
        break;
    case PolicyType.Proxy:
        await policyHttpService.EditProxyPolicy(policy as ProxyPolicySummary);
        break;
    default:
        const exhaustiveCheck: never = policy;
        return exhaustiveCheck;
        break;
    }

    logger.info(`Added ${userEmail} to ${policyName} policy!`);
    await cleanExit(0, logger);
}

