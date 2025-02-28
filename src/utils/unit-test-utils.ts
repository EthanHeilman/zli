import fs from 'fs';
import { CreateUniversalConnectionRequest } from 'webshell-common-ts/http/v2/connection/requests/create-universal-connection.request';
import { CreateUniversalConnectionResponse } from 'webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { ShellConnectionAuthDetails } from 'webshell-common-ts/http/v2/connection/types/shell-connection-auth-details.types';
import { EnvironmentSummary } from 'webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { KubeClusterSummary } from 'webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { SsmTargetSummary } from 'webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { DynamicAccessConfigSummary } from 'webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-summary.types';
import { BzeroAgentSummary } from 'webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { DbTargetSummary } from 'webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { WebTargetSummary } from 'webshell-common-ts/http/v2/target/web/types/web-target-summary.types';
import { GroupSummary } from 'webshell-common-ts/http/v2/organization/types/group-summary.types';
import { ApiKeySummary } from 'webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { KubernetesPolicySummary } from 'webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { OrganizationControlsPolicySummary } from 'webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from 'webshell-common-ts/http/v2/policy/types/group.types';
import { ProxyPolicySummary } from 'webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { SessionRecordingPolicySummary } from 'webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { TargetUser } from 'webshell-common-ts/http/v2/policy/types/target-user.types';
import { ShellConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/shell-connection-summary.types';
import { ConnectionState } from 'webshell-common-ts/http/v2/connection/types/connection-state.types';
import { SpaceSummary } from 'webshell-common-ts/http/v2/space/types/space-summary.types';
import { SpaceState } from 'webshell-common-ts/http/v2/space/types/space-state.types';
import { UserSummary } from 'webshell-common-ts/http/v2/user/types/user-summary.types';
import { DynamicAccessConfigStatus } from 'webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-status.types';
import { SshTargetsResponse } from 'webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { GAService } from 'services/Tracking/google-analytics.service';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { ConfigService } from 'services/config/config.service';
import * as middlewareHandler from 'handlers/middleware.handler';
import * as CleanExitHandler from 'handlers/clean-exit.handler';
import { JustInTimePolicySummary } from 'webshell-common-ts/http/v2/policy/just-in-time/types/just-in-time-policy-summary.types';
import { DbConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/db-connection-summary.types';
import { randomUUID } from 'crypto';
import { KubeConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/kube-connection-summary.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { ServiceAccountSummary } from 'webshell-common-ts/http/v2/service-account/types/service-account-summary.types';
import { AgentType } from 'webshell-common-ts/http/v2/target/types/agent.types';
import { RDPConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/rdp-connection-summary.types';
import { ScriptResponse } from 'webshell-common-ts/http/v2/autodiscovery-script/responses/script.responses';
import { SQLServerConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/sql-server-connection-summary.types';

export function unitTestMockSetup(withCleanExit: boolean): void {
    // Always mock out the following services
    if (withCleanExit) {
        jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());
    }
    jest.spyOn(middlewareHandler, 'oAuthMiddleware').mockImplementation(async (_configService, _logger) => Promise.resolve());
    jest.spyOn(middlewareHandler, 'bzCertValidationInfoMiddleware').mockImplementation(async (_configService, _logger) => Promise.resolve());
    jest.spyOn(GAService.prototype, 'TrackCliCommand').mockImplementation(() => Promise.resolve());
    jest.spyOn(EnvironmentHttpService.prototype, 'ListEnvironments').mockImplementation(async () => mockEnvList);
    jest.spyOn(ConfigService.prototype, 'me').mockImplementation(() => mockSubjectSummary);
}

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

// To avoid having to mock getEnvironmentFromName() when environmentName is not specified
const defaultMockEnv: EnvironmentSummary = JSON.parse(JSON.stringify(mockEnv));
defaultMockEnv.name = 'Default';
export const defaultMockEnvList: EnvironmentSummary[] = [
    defaultMockEnv, mockEnv
];

export const mockEnvList: EnvironmentSummary[] = [
    mockEnv
];

export const mockSubjectSummary: SubjectSummary = {
    id: 'some-subject-id',
    organizationId: 'test-org-id',
    email: 'test-email',
    isAdmin: true,
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    lastLogin: new Date(1998, 3, 5, 0, 0, 0, 0),
    type: SubjectType.User
};

export const mockUserSummary: UserSummary = {
    id: 'some-subject-id',
    organizationId: 'test-org-id',
    fullName: 'test-full-name',
    email: 'test-email',
    isAdmin: true,
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    lastLogin: new Date(1998, 3, 5, 0, 0, 0, 0)
};

export const mockUserSummaryList: UserSummary[] = [
    mockUserSummary,
];

export const mockServiceAccountSummary: ServiceAccountSummary = {
    id: 'some-sa-id',
    organizationId: 'test-org-id',
    email: 'test-email',
    externalId: 'test-external-id',
    jwksUrl: 'test-jwks-url',
    jwksUrlPattern: 'test-jwks-url-pattern',
    isAdmin: false,
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    lastLogin: new Date(1998, 3, 5, 0, 0, 0, 0),
    createdBy: 'some-subject-id',
    enabled: true
};

export const mockServiceAccountSummaryList: ServiceAccountSummary[] = [
    mockServiceAccountSummary,
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
    region: 'test-region',
    controlChannel: undefined
}];

export const mockTargetUser: TargetUser = {
    userName: 'test-user'
};

export const mockTargetUserList: TargetUser[] = [
    mockTargetUser
];

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
    }],
    status: DynamicAccessConfigStatus.Online
}];

export const mockBzeroSummaryList: BzeroAgentSummary[] = [{
    id: 'test-mock-bzero-id',
    name: 'test-bzero-name',
    status: TargetStatus.Online,
    environmentId: 'test-env-id',
    agentVersion: 'test-agent-version',
    agentType: AgentType.Linux,
    agentPublicKey: 'test-public-key',
    lastAgentUpdate: new Date(1998, 3, 5, 0, 0, 0, 0),
    region: 'test-region',
    allowedTargetUsers: [mockTargetUser],
    allowedVerbs: [{
        type: VerbType.Shell
    }],
    controlChannel: undefined
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
    localPort: { value: 1234 },
    localHost: 'localhost',
    remotePort: { value: 1234 },
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
    localPort: { value: 1234 },
    localHost: 'localhost',
    remotePort: { value: 1234 },
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
    }],
    targetUsers: [{
        userName: 'test-user',
    }],
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

export const mockJustInTimePolicySummaryList: JustInTimePolicySummary[] = [{
    type: PolicyType.JustInTime,
    id: 'some-jit-policy-id',
    name: 'some-jit-policy-name',
    description: 'some-jit-policy-description',
    subjects: [mockSubject],
    groups: [mockGroup],
    childPolicies: [{
        id: 'some-child-policy-id',
        name: 'some-child-policy-name',
        type: PolicyType.TargetConnect
    }],
    automaticallyApproved: false,
    duration: 60,
}];

export const mockConnectionSummary: ShellConnectionSummary = {
    id: 'cf8ce789-422b-4ace-8df5-d6c75b1fa1af',
    timeCreated : new Date(1998, 3, 5, 0, 0, 0, 0),
    spaceId : 'df262ee7-b749-4f08-ae61-3cd63a4fecd7', // This is the same as the mockSpaceSummary
    state : ConnectionState.Open,
    targetId : 'some-target-id',
    targetType : TargetType.SsmTarget,
    targetUser : 'some-target-user',
    sessionRecordingAvailable : false,
    sessionRecording : false,
    inputRecording : false,
    subjectId : 'some-subject-id'
};

export const mockKubeConnectionSummary: KubeConnectionSummary = {
    id: randomUUID(),
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    state: ConnectionState.Open,
    targetId: 'some-target-id',
    targetName: 'some-target-name',
    targetType: TargetType.Cluster,
    subjectId: 'some-subject-id',
    targetUser: 'foo',
    targetGroups: []
};

export const mockDbConnectionSummary: DbConnectionSummary = {
    id: randomUUID(),
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    state: ConnectionState.Open,
    targetId: 'some-target-id',
    targetName: 'some-target-name',
    targetType: TargetType.Db,
    subjectId: 'some-subject-id',
    remoteHost: 'localhost',
    remotePort: 5432
};

export const mockRDPConnectionSummary: RDPConnectionSummary = {
    id: randomUUID(),
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    state: ConnectionState.Open,
    targetId: 'some-target-id',
    targetName: 'some-target-name',
    targetType: TargetType.Windows,
    subjectId: 'some-subject-id',
    remoteHost: 'localhost',
    remotePort: 3389
};

export const mockSQLServerConnectionSummary: SQLServerConnectionSummary = {
    id: randomUUID(),
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    state: ConnectionState.Open,
    targetId: 'some-target-id',
    targetName: 'some-target-name',
    targetType: TargetType.Windows,
    subjectId: 'some-subject-id',
    remoteHost: 'localhost',
    remotePort: 1433
};

export const mockShellAuthDetails: ShellConnectionAuthDetails = {
    connectionNodeId: '998457d7-cce5-4fd2-98b9-7c550eb7ed5f',
    authToken: 'test-token',
    connectionServiceUrl: 'test-connection-url',
    region: 'test-region'
};

export const mockUniversalConnectionRequest: CreateUniversalConnectionRequest = {
    targetId: undefined,
    targetName: 'bzero-ec2-test',
    envId: '1e8e28fa-6e6b-4fc0-8994-38d69d987978',
    envName: undefined,
    targetUser: 'ec2-user',
    targetGroups: [],
    targetType: TargetType.Linux
};

export const mockUniversalConnectionResponse: CreateUniversalConnectionResponse = {
    connectionId: 'f11ae2c2-48a7-4a29-b306-8bc83da3c045',
    targetId: '9f728982-3691-4e71-9533-1892d5c65eb9',
    targetName: 'bzero-ec2-test',
    agentType: AgentType.Linux,
    targetType: TargetType.Bzero,
    verbType: VerbType.Shell,
    targetUser: 'ec2-user',
    agentPublicKey: 'test-public-key',
    agentVersion: 'test-bzero-version',
    connectionAuthDetails: mockShellAuthDetails
};


export const mockSpaceSummary: SpaceSummary = {
    id: 'df262ee7-b749-4f08-ae61-3cd63a4fecd7',
    displayName: 'cli-space',
    timeCreated: new Date(1998, 3, 5, 0, 0, 0, 0),
    state: SpaceState.Active,
    connections: [mockConnectionSummary],
    terminalPreferences: 'some-preferences',
};

export const mockScript: string = 'test-script';

export const mockScriptResponse: ScriptResponse = {autodiscoveryScript: mockScript};

export const mockTunnelsResponse: SshTargetsResponse = {
    guid: 'test-guid',
    targetName: 'test-target-name',
    targetUsers: mockTargetUserList
};

export const mockTunnelsResponseList: SshTargetsResponse[] = [
    mockTunnelsResponse
];

/**
 * This helper function creates a temporary directory at the specified path as well as writes to
 * file(s) within the temporary directory for testing.
 * @param pathToDir Path to temp dir to be created
 * @param files Array of file(s) to be created
 * @param fileContents String(s) to be written to the corresponding file in files
 */
export function createTempDirectory(pathToDir: string, files: string[], fileContents: string[]): void {
    // Delete dir first if it already exists
    deleteDirectory(pathToDir);

    // Create temp dir
    fs.mkdirSync(pathToDir, { recursive: true });

    // Write to file(s) within temp dir
    for (let i = 0; i < files.length; i++) {
        fs.writeFileSync(files[i], fileContents[i]);
        i += 1;
    };
}

/**
 * This helper function recursively deletes a directory at the specified path.
 * @param pathToDir Path to temp dir to be created
 */
export function deleteDirectory(pathToDir: string) {
    if (fs.existsSync(pathToDir)) {
        fs.rmdirSync(pathToDir, { recursive: true });
    }
}

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

/**
 * Convert a map to an array of tuples where the first element is the key and
 * the second element is the value
 * @param map Map to convert
 */
export function mapToArrayTuples<K, V>(map: Map<K, V>): [K, V][] {
    return Array.from(map.keys()).reduce<[K, V][]>((acc, el) => {
        acc.push([el, map.get(el)]);
        return acc;
    }, []);
}