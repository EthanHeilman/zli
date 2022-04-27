import { EnvironmentSummary } from '../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { KubeClusterSummary } from '../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { TargetStatus } from '../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';
import { SsmTargetSummary } from '../../webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { VerbType } from '../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { DynamicAccessConfigSummary } from '../../webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-summary.types';
import { BzeroAgentSummary } from '../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { DbTargetSummary } from '../../webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { WebTargetSummary } from '../../webshell-common-ts/http/v2/target/web/types/web-target-summary.types';
import { GroupSummary } from '../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { ApiKeySummary } from '../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { KubernetesPolicySummary } from '../../webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { PolicyType } from '../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { SubjectType } from '../../webshell-common-ts/http/v2/common.types/subject.types';
import { OrganizationControlsPolicySummary } from '../../webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { Subject } from '../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from '../../webshell-common-ts/http/v2/policy/types/group.types';
import { ProxyPolicySummary } from '../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { SessionRecordingPolicySummary } from '../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicySummary } from '../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { TargetUser } from '../../webshell-common-ts/http/v2/policy/types/target-user.types';
import { UserSummary } from '../../webshell-common-ts/http/v2/user/types/user-summary.types';

export const mockEnv: EnvironmentSummary = {
    id: 'test-env-id',
    organizationId: 'test-org-id',
    isDefault: true,
    name: 'test-env-name',
    description: 'test-description',
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    offlineCleanupTimeoutHours: 1,
    targets : []
};

export const mockEnvList: EnvironmentSummary[] = [
    mockEnv
];

export const mockUserSummary: UserSummary = {
    id: 'some-subject-id',
    organizationId: 'test-org-id',
    fullName: 'test-full-name',
    email: 'test-email',
    isAdmin: true,
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    lastLogin: new Date(1998, 3, 5, 0, 0, 0, 0),
};

export const mockUserSummaryList: UserSummary[] = [
    mockUserSummary,
];

export const mockKubeSummaryList: KubeClusterSummary[] = [{
    id: 'test-mock-kube-id',
    environmentId: 'test-env-id',
    lastAgentUpdate: new Date(1998, 3, 5, 0, 0, 0, 0),
    allowedClusterUsers: ['mock-allowed-user'],
    allowedClusterGroups: ['mock-allowed-group'],
    agentPublicKey: 'test-public-key',
    status: TargetStatus.Online,
    name: 'test-cluster-name',
    type: TargetType.Cluster,
    agentVersion: 'test-version',
    region: 'test-region'
}];

export const mockTargetUser: TargetUser = {
    userName: 'test-user'
};

export const mockSsmSummaryList: SsmTargetSummary[] = [{
    id: 'test-mock-ssm-id',
    name: 'test-ssm-name',
    status: TargetStatus.Online,
    environmentId: 'test-env-id',
    agentId: 'test-agent-id',
    agentVersion: 'test-agent-version',
    agentPublicKey: 'test-public-key',
    timeLastStatusUpdate: new Date(1998, 3, 5, 0, 0, 0, 0),
    region: 'test-region',
    allowedTargetUsers: [mockTargetUser],
    allowedVerbs: [{
        type: VerbType.Shell
    }]
}];

export const mockDatSummaryList: DynamicAccessConfigSummary[] = [{
    id: 'test-mock-dat-id',
    name: 'test-ssm-name',
    startWebhook: 'test-start-endpoint',
    stopWebhook: 'test-stop-endpoint',
    healthWebhook: 'test-health-endpoint',
    environmentId: 'test-env-id',
    allowedTargetUsers: [mockTargetUser],
    allowedVerbs: [{
        type: VerbType.Shell
    }]
}];

export const mockBzeroSummaryList: BzeroAgentSummary[] = [{
    id: 'test-mock-bzero-id',
    name: 'test-bzero-name',
    status: TargetStatus.Online,
    environmentId: 'test-env-id',
    agentVersion: 'test-agent-version',
    agentPublicKey: 'test-public-key',
    lastAgentUpdate: new Date(1998, 3, 5, 0, 0, 0, 0),
    region: 'test-region',
    allowedTargetUsers: [mockTargetUser],
    allowedVerbs: [{
        type: VerbType.Shell
    }]
}];

export const mockDbSummaryList: DbTargetSummary[] = [{
    id: 'test-mock-db-id',
    name: 'test-db-name',
    status: TargetStatus.Online,
    environmentId: 'test-env-id',
    agentVersion: 'test-agent-version',
    agentPublicKey: 'test-public-key',
    lastAgentUpdate: new Date(1998, 3, 5, 0, 0, 0, 0),
    region: 'test-region',
    type: TargetType.Db,
    localPort: 1234,
    localHost: 'localhost',
    remotePort: 1234,
    remoteHost: 'remotehost',
    proxyTargetId: 'some-proxy-id',
}];

export const mockWebSummaryList: WebTargetSummary[] = [{
    id: 'test-mock-web-id',
    name: 'test-web-name',
    status: TargetStatus.Online,
    environmentId: 'test-env-id',
    agentVersion: 'test-agent-version',
    agentPublicKey: 'test-public-key',
    lastAgentUpdate: new Date(1998, 3, 5, 0, 0, 0, 0),
    region: 'test-region',
    type: TargetType.Db,
    localPort: 1234,
    localHost: 'localhost',
    remotePort: 1234,
    remoteHost: 'remotehost',
    proxyTargetId: 'some-proxy-id',
}];

export const mockGroupsSummaryList: GroupSummary[] = [{
    idPGroupId: 'some-group-id',
    name: 'some-group-name'
}];

export const mockApiKeySummaryList: ApiKeySummary[] = [{
    id: 'some-api-key-id',
    name: 'some-api-key-name',
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    isRegistrationKey: true,
}];

export const mockSubject: Subject = {
    id: 'some-subject-id',
    type: SubjectType.User
};

export const mockGroup: Group = {
    id: 'some-group-id',
    name: 'some-group-name'
};

export const mockKubernetesPolicySummaryList: KubernetesPolicySummary[] = [{
    type: PolicyType.Kubernetes,
    id: 'some-kube-policy-id',
    name: 'some-kube-policy-name',
    description: 'some-kube-policy-description',
    subjects: [mockSubject],
    groups: [mockGroup],
    environments: [mockEnv],
    clusters: [{
        id: 'some-cluster-id'
    }],
    clusterUsers: [{
        name: 'some-cluster-user'
    }],
    clusterGroups: [{
        name: 'some-cluster-group'
    }]
}];

export const mockOrganizationControlsPolicySummaryList: OrganizationControlsPolicySummary[] = [{
    type: PolicyType.OrganizationControls,
    id: 'some-org-control-policy-id',
    name: 'some-org-control-policy-name',
    description: 'some-org-control-policy-description',
    subjects: [mockSubject],
    groups: [mockGroup],
    mfaEnabled: false,
}];

export const mockProxyPolicySummaryList: ProxyPolicySummary[] = [{
    type: PolicyType.Proxy,
    id: 'some-org-control-policy-id',
    name: 'some-org-control-policy-name',
    description: 'some-org-control-policy-description',
    subjects: [mockSubject],
    groups: [mockGroup],
    environments: [mockEnv],
    targets: [{
        id: 'mock-proxy-target-id',
        type: TargetType.Db
    }]
}];

export const mockSessionRecordingPolicySummaryList: SessionRecordingPolicySummary[] = [{
    type: PolicyType.SessionRecording,
    id: 'some-session-recording-policy-id',
    name: 'some-session-recording-policy-name',
    description: 'some-session-recording-policy-description',
    subjects: [mockSubject],
    groups: [mockGroup],
    recordInput: true,
}];

export const mockTargetConnectPolicySummaryList: TargetConnectPolicySummary[] = [{
    type: PolicyType.TargetConnect,
    id: 'some-session-recording-policy-id',
    name: 'some-session-recording-policy-name',
    description: 'some-session-recording-policy-description',
    subjects: [mockSubject],
    groups: [mockGroup],
    environments: [mockEnv],
    targets: [{
        id: 'mock-proxy-target-id',
        type: TargetType.Db
    }],
    targetUsers: [mockTargetUser],
    verbs: [{
        type: VerbType.Shell
    }]
}];

/**
 * Some of our zli code calls Table, which automatically adds color, this helper function removes any color from
 * that output so we can compare to regular strings
 * Ref: https://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings
 * @param output Output of console.log
 * @returns Cleaned output without any colors
 */
export function cleanConsoleLog(output: string): string {
    return output.replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}