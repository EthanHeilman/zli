import { systemTestUniqueId } from '../../../system-test';
import { kubernetesPolicySuite } from './policies-kubernetes';
import { organizationControlsPolicySuite } from './policies-organization-controls';
import { proxyPolicySuite } from './policies-proxy';
import { sessionRecordingPolicySuite } from './policies-session-recording';
import { targetConnectPolicySuite } from './policies-target-connect';

export const restApiPolicyDescriptionTemplate = `$POLICY_TYPE test policy for REST API test: ${systemTestUniqueId}`;

export const policySuite = () => describe('Policies Suite', () => {
    sessionRecordingPolicySuite();
    targetConnectPolicySuite();
    proxyPolicySuite();
    kubernetesPolicySuite();
    organizationControlsPolicySuite();
});