import { KubernetesPolicyCreateRequest } from 'webshell-common-ts/http/v2/policy/kubernetes/requests/kubernetes-policy-create.requests';
import { KubernetesPolicyUpdateRequest } from 'webshell-common-ts/http/v2/policy/kubernetes/requests/kubernetes-policy-update.requests';
import { KubernetesPolicySummary } from 'webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { OrganizationControlsPolicyCreateRequest } from 'webshell-common-ts/http/v2/policy/organization-controls/requests/organization-controls-policy-create.requests';
import { OrganizationControlsPolicyUpdateRequest } from 'webshell-common-ts/http/v2/policy/organization-controls/requests/organization-controls-policy-update.requests';
import { OrganizationControlsPolicySummary } from 'webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { ProxyPolicySummary } from 'webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { ProxyPolicyCreateRequest } from 'webshell-common-ts/http/v2/policy/proxy/requests/proxy-policy-create.requests';
import { ProxyPolicyUpdateRequest } from 'webshell-common-ts/http/v2/policy/proxy/requests/proxy-policy-update.requests';
import { SessionRecordingPolicyCreateRequest } from 'webshell-common-ts/http/v2/policy/session-recording/requests/session-recording-create.requests';
import { SessionRecordingPolicyUpdateRequest } from 'webshell-common-ts/http/v2/policy/session-recording/requests/session-recording-policy-update.requests';
import { SessionRecordingPolicySummary } from 'webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicyCreateRequest } from 'webshell-common-ts/http/v2/policy/target-connect/requests/target-connect-policy-create.requests';
import { TargetConnectPolicyUpdateRequest } from 'webshell-common-ts/http/v2/policy/target-connect/requests/target-connect-policy-update.requests';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { JustInTimePolicySummary } from 'webshell-common-ts/http/v2/policy/just-in-time/types/just-in-time-policy-summary.types';
import { JustInTimePolicyCreateRequest } from 'webshell-common-ts/http/v2/policy/just-in-time/requests/just-in-time-policy-create.requests';
import { JustInTimePolicyUpdateRequest } from 'webshell-common-ts/http/v2/policy/just-in-time/requests/just-in-time-policy-update.requests';

import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

const KUBE: string = 'kubernetes';
const ORG: string = 'organization-controls';
const SESSION: string = 'session-recording';
const TARGET: string = 'target-connect';
const PROXY: string = 'proxy';
const JIT: string = 'just-in-time';

export class PolicyHttpService extends HttpService
{
    protected constructor() {
        super()
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new PolicyHttpService();
        service.make(configService, 'api/v2/policies', logger);
        return service
    }

    public ListKubernetesPolicies(subjects?: string, groups?: string): Promise<KubernetesPolicySummary[]>
    {
        return this.Get(KUBE, {subjects: subjects, groups: groups });
    }

    public ListOrganizationControlPolicies(): Promise<OrganizationControlsPolicySummary[]>
    {
        return this.Get(ORG);
    }

    public ListProxyPolicies(): Promise<ProxyPolicySummary[]>
    {
        return this.Get(PROXY);
    }

    public ListSessionRecordingPolicies(): Promise<SessionRecordingPolicySummary[]>
    {
        return this.Get(SESSION);
    }

    public ListTargetConnectPolicies(): Promise<TargetConnectPolicySummary[]>
    {
        return this.Get(TARGET);
    }

    public ListJustInTimePolicies(): Promise<JustInTimePolicySummary[]>
    {
        return this.Get(JIT);
    }


    public EditKubernetesPolicy(
        policy: KubernetesPolicySummary
    ): Promise<KubernetesPolicySummary> {
        const request: KubernetesPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            clusters: policy.clusters,
            clusterUsers: policy.clusterUsers,
            clusterGroups: policy.clusterGroups,
        };
        return this.Patch(`${KUBE}/${policy.id}` , request);
    }

    public UpdateKubernetesPolicy(policyId: string, request: KubernetesPolicyUpdateRequest):
            Promise<KubernetesPolicySummary> {
        return this.Patch(`${KUBE}/${policyId}`, request);
    }

    public EditOrganizationControlPolicy(
        policy: OrganizationControlsPolicySummary
    ): Promise<OrganizationControlsPolicySummary> {
        const request: OrganizationControlsPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            mfaEnabled: policy.mfaEnabled
        };
        return this.Patch(`${ORG}/${policy.id}`, request);
    }

    public UpdateOrganizationControlsPolicy(policyId: string, request: OrganizationControlsPolicyUpdateRequest):
            Promise<OrganizationControlsPolicySummary> {
        return this.Patch(`${ORG}/${policyId}`, request);
    }

    public EditSessionRecordingPolicy(
        policy: SessionRecordingPolicySummary
    ): Promise<SessionRecordingPolicySummary> {
        const request: SessionRecordingPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            recordInput: policy.recordInput
        };
        return this.Patch(`${SESSION}/${policy.id}`, request);
    }

    public UpdateSessionRecordingPolicy(policyId: string, request: SessionRecordingPolicyUpdateRequest):
            Promise<SessionRecordingPolicySummary> {
        return this.Patch(`${SESSION}/${policyId}`, request);
    }

    public EditTargetConnectPolicy(
        policy: TargetConnectPolicySummary
    ): Promise<TargetConnectPolicySummary> {
        const request: TargetConnectPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            targets: policy.targets,
            targetUsers: policy.targetUsers,
            verbs: policy.verbs
        };
        return this.Patch(`${TARGET}/${policy.id}`, request);
    }

    public UpdateTargetConnectPolicy(policyId: string, request: TargetConnectPolicyUpdateRequest):
            Promise<TargetConnectPolicySummary> {
        return this.Patch(`${TARGET}/${policyId}`, request);
    }

    public EditProxyPolicy(
        policy: ProxyPolicySummary
    ): Promise<ProxyPolicySummary> {
        const request: ProxyPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            targets: policy.targets,
            targetUsers: policy.targetUsers,
        };
        return this.Patch(`${PROXY}/${policy.id}`, request);
    }

    public UpdateProxyPolicy(policyId: string, request: ProxyPolicyUpdateRequest):
            Promise<ProxyPolicySummary> {
        return this.Patch(`${PROXY}/${policyId}`, request);
    }

    public UpdateJustInTimePolicy(policyId: string, request: JustInTimePolicyUpdateRequest):
            Promise<JustInTimePolicySummary> {
        return this.Patch(`${JIT}/${policyId}`, request);
    }

    public EditJustInTimePolicy(
        policy: JustInTimePolicySummary
    ): Promise<JustInTimePolicySummary> {
        const request: JustInTimePolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            childPolicies: policy.childPolicies.map(p => p.id),
            automaticallyApproved: policy.automaticallyApproved,
            duration: policy.duration
        };
        return this.Patch(`${JIT}/${policy.id}`, request);
    }

    public AddKubernetesPolicy(request: KubernetesPolicyCreateRequest): Promise<KubernetesPolicySummary> {
        return this.Post(KUBE, request);
    }

    public AddOrganizationControlPolicy(request: OrganizationControlsPolicyCreateRequest): Promise<OrganizationControlsPolicySummary> {
        return this.Post(ORG, request);
    }

    public AddSessionRecordingPolicy(request: SessionRecordingPolicyCreateRequest): Promise<SessionRecordingPolicySummary> {
        return this.Post(SESSION, request);
    }

    public AddTargetConnectPolicy(request: TargetConnectPolicyCreateRequest): Promise<TargetConnectPolicySummary> {
        return this.Post(TARGET, request);
    }

    public AddProxyPolicy(request: ProxyPolicyCreateRequest): Promise<ProxyPolicySummary> {
        return this.Post(PROXY, request);
    }

    public AddJustInTimePolicy(request: JustInTimePolicyCreateRequest): Promise<JustInTimePolicySummary> {
        return this.Post(JIT, request);
    }

    public DeleteKubernetesPolicy(policyId: string): Promise<void> {
        return this.Delete(`${KUBE}/${policyId}`);
    }

    public DeleteOrganizationControlsPolicy(policyId: string): Promise<void> {
        return this.Delete(`${ORG}/${policyId}`);
    }

    public DeleteSessionRecordingPolicy(policyId: string): Promise<void> {
        return this.Delete(`${SESSION}/${policyId}`);
    }

    public DeleteTargetConnectPolicy(policyId: string): Promise<void> {
        return this.Delete(`${TARGET}/${policyId}`);
    }

    public DeleteProxyPolicy(policyId: string): Promise<void> {
        return this.Delete(`${PROXY}/${policyId}`);
    }

    public DeleteJustInTimePolicy(policyId: string): Promise<void> {
        return this.Delete(`${JIT}/${policyId}`);
    }

    public GetKubernetesPolicy(policyId: string): Promise<KubernetesPolicySummary> {
        return this.Get(`${KUBE}/${policyId}`);
    }

    public GetOrganizationControlsPolicy(policyId: string): Promise<OrganizationControlsPolicySummary> {
        return this.Get(`${ORG}/${policyId}`);
    }

    public GetSessionRecordingPolicy(policyId: string): Promise<SessionRecordingPolicySummary> {
        return this.Get(`${SESSION}/${policyId}`);
    }

    public GetTargetConnectPolicy(policyId: string): Promise<TargetConnectPolicySummary> {
        return this.Get(`${TARGET}/${policyId}`);
    }

    public GetProxyPolicy(policyId: string): Promise<ProxyPolicySummary> {
        return this.Get(`${PROXY}/${policyId}`);
    }

    public GetJustInTimePolicy(policyId: string): Promise<JustInTimePolicySummary> {
        return this.Get(`${JIT}/${policyId}`);
    }
}