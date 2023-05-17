import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { KubernetesPolicySummary } from 'webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { ProxyPolicySummary } from 'webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { JustInTimePolicySummary } from 'webshell-common-ts/http/v2/policy/just-in-time/types/just-in-time-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { UserHttpService } from 'http-services/user/user.http-services';
import { OrganizationHttpService } from 'http-services/organization/organization.http-services';
import { UserSummary } from 'webshell-common-ts/http/v2/user/types/user-summary.types';
import { GroupSummary } from 'webshell-common-ts/http/v2/organization/types/group-summary.types';
import { SessionRecordingPolicySummary } from 'webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';
import { ServiceAccountSummary } from 'webshell-common-ts/http/v2/service-account/types/service-account-summary.types';

export async function getPolicyFromName(policyName: string, policyHttpService: PolicyHttpService) :
Promise<KubernetesPolicySummary | TargetConnectPolicySummary | ProxyPolicySummary | JustInTimePolicySummary | SessionRecordingPolicySummary> {
    // Get the existing policies
    const [kubePolicies, targetPolicies, proxyPolicies, jitPolicies, sessionRecordingPolicies] = await Promise.all([
        policyHttpService.ListKubernetesPolicies(),
        policyHttpService.ListTargetConnectPolicies(),
        policyHttpService.ListProxyPolicies(),
        policyHttpService.ListJustInTimePolicies(),
        policyHttpService.ListSessionRecordingPolicies()
    ]);

    const allPolicies = [...kubePolicies, ...targetPolicies, ...proxyPolicies, ...jitPolicies, ...sessionRecordingPolicies];
    const policy = allPolicies.find(p => p.name == policyName);

    return policy;
}

export async function editPolicy(
    policy: KubernetesPolicySummary | TargetConnectPolicySummary | ProxyPolicySummary | JustInTimePolicySummary | SessionRecordingPolicySummary,
    policyHttpService: PolicyHttpService) : Promise<void> {
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
    case PolicyType.JustInTime:
        await policyHttpService.EditJustInTimePolicy(policy as JustInTimePolicySummary);
        break;
    case PolicyType.SessionRecording:
        await policyHttpService.EditSessionRecordingPolicy(policy as SessionRecordingPolicySummary);
        break;
    default:
        const exhaustiveCheck: never = policy;
        return exhaustiveCheck;
    }
}

export async function getPolicySubjectDisplayInfo(
    configService: ConfigService,
    logger: Logger
) {
    const userHttpService = new UserHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);

    const [users, groups, serviceAccounts] = await Promise.all([
        userHttpService.ListUsers(),
        organizationHttpService.ListGroups(),
        serviceAccountHttpService.ListServiceAccounts()
    ]);

    const userMap : { [id: string]: UserSummary } = {};
    users.forEach(userSummary => {
        userMap[userSummary.id] = userSummary;
    });

    const groupMap : { [id: string]: GroupSummary } = {};
    if (!!groups)
        groups.forEach(groupSummary => {
            groupMap[groupSummary.idPGroupId] = groupSummary;
        });

    const serviceAccountMap : { [id: string]: ServiceAccountSummary } = {};
    serviceAccounts
        .filter(sa => sa.enabled)
        .forEach(serviceAccountSummary => {
            serviceAccountMap[serviceAccountSummary.id] = serviceAccountSummary;
        });

    return {
        userMap: userMap,
        groupMap: groupMap,
        serviceAccountMap: serviceAccountMap
    };
}