import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';

export async function deleteTargetUserFromPolicyHandler(targetUserName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First get the existing policy
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubernetesPolicies();
    const targetPolicies = await policyHttpService.ListTargetConnectPolicies();
    const proxyPolicies = await policyHttpService.ListProxyPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);
    const targetPolicy = targetPolicies.find(p => p.name == policyName);
    const proxyPolicy = proxyPolicies.find(p => p.name == policyName);

    if (!kubePolicy && !targetPolicy && !proxyPolicy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    if (kubePolicy) {
        // If this cluster targetUser exists already
        if (!kubePolicy.clusterUsers.find(u => u.name === targetUserName)) {
            logger.error(`No target user ${targetUserName} exists for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // And finally update the policy
        kubePolicy.clusterUsers = kubePolicy.clusterUsers.filter(u => u.name !== targetUserName);

        await policyHttpService.EditKubernetesPolicy(kubePolicy);
    } else if (targetPolicy) {
        // If this cluster targetUser exists already
        if (!targetPolicy.targetUsers.find(u => u.userName === targetUserName)) {
            logger.error(`No target user ${targetUserName} exists for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // And finally update the policy
        targetPolicy.targetUsers = targetPolicy.targetUsers.filter(u => u.userName !== targetUserName);

        await policyHttpService.EditTargetConnectPolicy(targetPolicy);
    } else if (proxyPolicy) {
        // If this cluster targetUser does not exist in the policy
        if (!proxyPolicy.targetUsers.find(u => u.userName === targetUserName)) {
            logger.error(`No target user ${targetUserName} exists for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // update the policy
        proxyPolicy.targetUsers = proxyPolicy.targetUsers.filter(u => u.userName !== targetUserName);
        await policyHttpService.EditProxyPolicy(proxyPolicy);
    } else {
        logger.error(`Delete target user from policy ${policyName} failed. Deleting target users from this policy type is not currently supported.`);
        await cleanExit(1, logger);
    }

    logger.info(`Deleted ${targetUserName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}

