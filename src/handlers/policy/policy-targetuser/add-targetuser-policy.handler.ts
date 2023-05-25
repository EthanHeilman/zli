import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { ClusterUser } from 'webshell-common-ts/http/v2/policy/types/cluster-user.types';
import { TargetUser } from 'webshell-common-ts/http/v2/policy/types/target-user.types';

export async function addTargetUserToPolicyHandler(targetUserName: string, policyName: string, configService: ConfigService, logger: Logger) {
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
        throw new Error(`Unable to find policy with name: ${policyName}`);
    }

    if (kubePolicy) {
        // If this cluster targetUser exists already
        if (kubePolicy.clusterUsers.find(u => u.name === targetUserName)) {
            throw new Error(`Target user ${targetUserName} exists already for policy: ${policyName}`);
        }

        // Then add the targetUser to the policy
        const clusterUserToAdd: ClusterUser = {
            name: targetUserName
        };

        // And finally update the policy
        kubePolicy.clusterUsers.push(clusterUserToAdd);

        await policyHttpService.EditKubernetesPolicy(kubePolicy);
    } else if (targetPolicy) {
        // If this targetUser exists already
        if (targetPolicy.targetUsers.find(u => u.userName === targetUserName)) {
            throw new Error(`Target user ${targetUserName} exists already for policy: ${policyName}`);
        }

        // Then add the targetUser to the policy
        const targetUserToAdd: TargetUser = {
            userName: targetUserName
        };

        // And finally update the policy
        targetPolicy.targetUsers.push(targetUserToAdd);
        await policyHttpService.EditTargetConnectPolicy(targetPolicy);
    } else if (proxyPolicy) {
        // If this targetUser exists already
        if (proxyPolicy.targetUsers.find(u => u.userName === targetUserName)) {
            throw new Error(`Target user ${targetUserName} exists already for policy: ${policyName}`);
        }

        // Then add the targetUser to the policy
        const targetUserToAdd: TargetUser = {
            userName: targetUserName
        };

        // And finally update the policy
        proxyPolicy.targetUsers.push(targetUserToAdd);
        await policyHttpService.EditProxyPolicy(proxyPolicy);
    } else {
        throw new Error(`Adding target user to policy ${policyName} failed. Adding target users to this policy type is not currently supported.`);
    }

    logger.info(`Added ${targetUserName} to ${policyName} policy!`);
}