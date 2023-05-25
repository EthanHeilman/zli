import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';

export async function deleteTargetGroupFromPolicyHandler(targetGroupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First get the existing policy
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubernetesPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);

    if (!kubePolicy) {
        // Log an error
        throw new Error(`Unable to find Kubernetes Tunnel policy with name: ${policyName}. Please make sure ${policyName} is a Kubernetes Tunnel policy.`);
    }

    // Now check if the group exists
    if (!kubePolicy.clusterGroups.find(g => g.name === targetGroupName)) {
        throw new Error(`No group ${targetGroupName} exists for policy: ${policyName}`);
    }

    // And finally update the policy
    kubePolicy.clusterGroups = kubePolicy.clusterGroups.filter(u => u.name !== targetGroupName);

    await policyHttpService.EditKubernetesPolicy(kubePolicy);

    logger.info(`Deleted ${targetGroupName} from ${policyName} policy!`);
}

