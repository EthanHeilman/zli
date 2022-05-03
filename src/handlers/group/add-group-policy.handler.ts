import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { KubernetesPolicySummary } from '../../../webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { TargetConnectPolicySummary } from '../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { PolicyType } from '../../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { ProxyPolicySummary } from '../../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { GroupSummary } from '../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { Group } from '../../../webshell-common-ts/http/v2/policy/types/group.types';

export async function addGroupToPolicyHandler(groupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the group
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.ListGroups();
    let groupSummary : GroupSummary = undefined;
    for (const group of groups){
        if (group.name == groupName)
            groupSummary = group;
    }
    if (groupSummary == undefined) {
        logger.error(`Unable to find group with name: ${groupName}`);
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

    // If this group exists already
    const group = policy.groups.find((g: Group) => g.name == groupSummary.name);
    if (group) {
        logger.error(`Group ${groupSummary.name} exists already for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then add the group to the policy
    const groupToAdd: Group = {
        id: groupSummary.idPGroupId,
        name: groupSummary.name
    };
    policy.groups.push(groupToAdd);

    // And finally update the policy
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

    logger.info(`Added ${groupName} to ${policyName} policy!`);
    await cleanExit(0, logger);
}
