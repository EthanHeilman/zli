import { systemTestUniqueId } from 'system-tests/tests/system-test';
import { justInTimePolicySuite } from 'system-tests/tests/suites/rest-api/policies/policies-just-in-time';
import { kubernetesPolicySuite } from 'system-tests/tests/suites/rest-api/policies/policies-kubernetes';
import { organizationControlsPolicySuite } from 'system-tests/tests/suites/rest-api/policies/policies-organization-controls';
import { proxyPolicySuite } from 'system-tests/tests/suites/rest-api/policies/policies-proxy';
import { sessionRecordingPolicySuite } from 'system-tests/tests/suites/rest-api/policies/policies-session-recording';
import { targetConnectPolicySuite } from 'system-tests/tests/suites/rest-api/policies/policies-target-connect';

export const restApiPolicyNameTemplate = `rest-api-test-$POLICY_TYPE-policy-${systemTestUniqueId}`;
export const restApiPolicyDescriptionTemplate = `$POLICY_TYPE test policy for REST API test: ${systemTestUniqueId}`;

export const policySuite = () => describe('Policies Suite', () => {
    sessionRecordingPolicySuite();
    targetConnectPolicySuite();
    proxyPolicySuite();
    kubernetesPolicySuite();
    organizationControlsPolicySuite();
    justInTimePolicySuite();
});