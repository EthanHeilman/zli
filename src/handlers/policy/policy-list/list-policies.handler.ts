import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { policyArgs } from 'handlers/policy/policy-list/policy-list.command-builder';
import { listTargetConnectPoliciesHandler } from 'handlers/policy/policy-list/list-target-connect-policies.handler';
import { listKubernetesPoliciesHandler } from 'handlers/policy/policy-list/list-kubernetes-policies.handler';
import { listSessionRecordingPoliciesHandler } from 'handlers/policy/policy-list/list-session-recording-policies.handler';
import { listProxyPoliciesHandler } from 'handlers/policy/policy-list/list-proxy-policies.handler';
import { parsePolicyType } from 'utils/utils';

import yargs from 'yargs';
import { listJustInTimePoliciesHandler } from 'handlers/policy/policy-list/list-just-in-time-policies.handler';
import { listOrganizationControlsPoliciesHandler } from 'handlers/policy/policy-list/list-organization-controls-policies.handler';

export async function listPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger,
) {
    // If provided type filter, apply it
    let policyType: PolicyType = undefined;
    if(!! argv.type) {
        policyType = parsePolicyType(argv.type);
    }

    let targetConnectPolicies = null;
    let kubePolicies = null;
    let sessRecordingPolicies = null;
    let proxyPolicies = null;
    let orgControlPolicies = null;
    let jitPolicies = null;

    switch (policyType) {
    case PolicyType.TargetConnect:
        targetConnectPolicies = await listTargetConnectPoliciesHandler(argv, configService, logger);
        printPolicyHelper(argv, targetConnectPolicies, policyType, logger);
        break;
    case PolicyType.Kubernetes:
        kubePolicies = await listKubernetesPoliciesHandler(argv, configService, logger);
        printPolicyHelper(argv, kubePolicies, policyType, logger);
        break;
    case PolicyType.SessionRecording:
        sessRecordingPolicies = await listSessionRecordingPoliciesHandler(argv, configService, logger);
        printPolicyHelper(argv, sessRecordingPolicies, policyType, logger);
        break;
    case PolicyType.Proxy:
        proxyPolicies = await listProxyPoliciesHandler(argv, configService, logger);
        printPolicyHelper(argv, proxyPolicies, policyType, logger);
        break;
    case PolicyType.JustInTime:
        jitPolicies = await listJustInTimePoliciesHandler(argv, configService, logger);
        printPolicyHelper(argv, jitPolicies, policyType, logger);
        break;
    case PolicyType.OrganizationControls:
        orgControlPolicies = await listOrganizationControlsPoliciesHandler(argv, configService, logger);
        printPolicyHelper(argv, orgControlPolicies, policyType, logger);
        break;
    default:
        [ targetConnectPolicies, kubePolicies, sessRecordingPolicies, proxyPolicies, orgControlPolicies, jitPolicies ] = await Promise.all([
            listTargetConnectPoliciesHandler(argv, configService, logger),
            listKubernetesPoliciesHandler(argv, configService, logger),
            listSessionRecordingPoliciesHandler(argv, configService, logger),
            listProxyPoliciesHandler(argv, configService, logger),
            listOrganizationControlsPoliciesHandler(argv, configService, logger),
            listJustInTimePoliciesHandler(argv, configService, logger)
        ]);

        // The order here decides in which order the policies are displayed
        // Need to explicitly structure this when calling handlers in parallel
        printPolicyHelper(argv, targetConnectPolicies, PolicyType.TargetConnect, logger);
        printPolicyHelper(argv, kubePolicies, PolicyType.Kubernetes, logger);
        printPolicyHelper(argv, sessRecordingPolicies, PolicyType.SessionRecording, logger);
        printPolicyHelper(argv, proxyPolicies, PolicyType.Proxy, logger);
        printPolicyHelper(argv, jitPolicies, PolicyType.JustInTime, logger);
        printPolicyHelper(argv, orgControlPolicies, PolicyType.OrganizationControls, logger);
        break;
    }
}

// Helper function to abstract printing to console
function printPolicyHelper(argv: yargs.Arguments<policyArgs>, results: string, policyType: PolicyType, logger: Logger) {
    // Need console.log in if statement to do nothing when no policies exist
    if(!! argv.json && results) {
        // json output
        console.log(results);
    } else if (!(!! argv.json) && results) {
        // Switch on policyType to display the table label using logger.warn
        switch (policyType) {
        case PolicyType.TargetConnect:
            logger.warn('Target Connect Policies:\n');
            break;
        case PolicyType.Kubernetes:
            logger.warn('Kubernetes Policies:\n');
            break;
        case PolicyType.SessionRecording:
            logger.warn('Session Recording Policies:\n');
            break;
        case PolicyType.Proxy:
            logger.warn('Proxy Policies:\n');
            break;
        case PolicyType.JustInTime:
            logger.warn('Just In Time Policies:\n');
            break;
        case PolicyType.OrganizationControls:
            logger.warn('Organization Controls Policies:\n');
            break;
        default:
            break;
        }
        // regular table output
        console.log(results);
        console.log('\n\n');
    }
}