import mockArgv from 'mock-argv';
import { CliDriver } from '../../cli-driver';
import { cleanConsoleLog, mockApiKeySummaryList, mockBzeroSummaryList, mockDatSummaryList, mockDbSummaryList, mockGroupsSummaryList, mockKubernetesPolicySummaryList, mockKubeSummaryList, mockOrganizationControlsPolicySummaryList, mockProxyPolicySummaryList, mockSessionRecordingPolicySummaryList, unitTestMockSetup, mockSsmSummaryList, mockTargetConnectPolicySummaryList, mockUserSummaryList, mockWebSummaryList } from '../../utils/unit-test-utils';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { PolicyHttpService } from '../../http-services/policy/policy.http-services';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { DbTargetHttpService } from '../../http-services/db-target/db-target.http-service';
import { WebTargetService } from '../../http-services/web-target/web-target.http-service';


describe('List Policies suite', () => {
    const targetConnectPolicyOutput = String.raw`┌────────────────────────┬───────────────────┬──────────────────────────┬────────────────────────────┬─────────────────────────────┬──────────────┐
│ Name                   │ Type              │ Subject                  │ Resource                   │ Target Users                │ Target Group │
├────────────────────────┼───────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────────┼──────────────┤
│ some-session-recordin… │ TargetConnect     │ test-full-name           │ Environments: test-env-na… │ Unix Users: test-user       │ N/A          │
│                        │                   │ Groups: some-group-name  │                            │                             │              │
└────────────────────────┴───────────────────┴──────────────────────────┴────────────────────────────┴─────────────────────────────┴──────────────┘`;

    const sessionRecordingPolicyOutput = String.raw`┌────────────────────────┬───────────────────┬──────────────────────────┬────────────────────────────┬─────────────────────────────┬──────────────┐
│ Name                   │ Type              │ Subject                  │ Resource                   │ Target Users                │ Target Group │
├────────────────────────┼───────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────────┼──────────────┤
│ some-session-recordin… │ SessionRecording  │ test-full-name           │ N/A                        │ N/A                         │ N/A          │
│                        │                   │ Groups: some-group-name  │                            │                             │              │
└────────────────────────┴───────────────────┴──────────────────────────┴────────────────────────────┴─────────────────────────────┴──────────────┘`;

    const proxyPolicyOuput = String.raw`┌────────────────────────┬───────────────────┬──────────────────────────┬────────────────────────────┐
│ Name                   │ Type              │ Subject                  │ Resource                   │
├────────────────────────┼───────────────────┼──────────────────────────┼────────────────────────────┤
│ some-org-control-poli… │ Proxy             │ test-full-name           │ Environments: test-env-na… │
│                        │                   │ Groups: some-group-name  │                            │
└────────────────────────┴───────────────────┴──────────────────────────┴────────────────────────────┘`;

    const kuberentesPolicyOutput = String.raw`┌────────────────────────┬───────────────────┬──────────────────────────┬────────────────────────────┬─────────────────────────────┬────────────────────────────────────┐
│ Name                   │ Type              │ Subject                  │ Resource                   │ Target Users                │ Target Group                       │
├────────────────────────┼───────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────┤
│ some-kube-policy-name  │ Kubernetes        │ test-full-name           │ Environments: test-env-na… │ Cluster Users: some-cluste… │ Cluster Groups: some-cluster-group │
│                        │                   │ Groups: some-group-name  │                            │                             │                                    │
└────────────────────────┴───────────────────┴──────────────────────────┴────────────────────────────┴─────────────────────────────┴────────────────────────────────────┘`;

    const organizationControlsPolicyOutput = String.raw`┌────────────────────────┬───────────────────┬──────────────────────────┬────────────────────────────┬─────────────────────────────┬──────────────┐
│ Name                   │ Type              │ Subject                  │ Resource                   │ Target Users                │ Target Group │
├────────────────────────┼───────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────────┼──────────────┤
│ some-org-control-poli… │ OrganizationCont… │ test-full-name           │ N/A                        │ N/A                         │ N/A          │
│                        │                   │ Groups: some-group-name  │                            │                             │              │
└────────────────────────┴───────────────────┴──────────────────────────┴────────────────────────────┴─────────────────────────────┴──────────────┘`;


    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Always mock out the following services
        unitTestMockSetup(true);

        jest.spyOn(OrganizationHttpService.prototype, 'ListGroups').mockImplementation(async () => {
            return mockGroupsSummaryList;
        });
        jest.spyOn(ApiKeyHttpService.prototype, 'ListAllApiKeys').mockImplementation(async () => {
            return mockApiKeySummaryList;
        });
        jest.spyOn(UserHttpService.prototype, 'ListUsers').mockImplementation(async () => mockUserSummaryList);
        jest.spyOn(KubeHttpService.prototype, 'ListKubeClusters').mockImplementation(async () => mockKubeSummaryList);
        jest.spyOn(SsmTargetHttpService.prototype, 'ListSsmTargets').mockImplementation(async () => mockSsmSummaryList);
        jest.spyOn(DynamicAccessConfigHttpService.prototype, 'ListDynamicAccessConfigs').mockImplementation(async () => mockDatSummaryList);
        jest.spyOn(BzeroTargetHttpService.prototype, 'ListBzeroTargets').mockImplementation(async () => mockBzeroSummaryList);
        jest.spyOn(DbTargetHttpService.prototype, 'ListDbTargets').mockImplementation(async () => mockDbSummaryList);
        jest.spyOn(WebTargetService.prototype, 'ListWebTargets').mockImplementation(async () => mockWebSummaryList);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    test('2500: List All Policies', async () => {
        // Mock our policy http service
        jest.spyOn(PolicyHttpService.prototype, 'ListKubernetesPolicies').mockImplementation(async () => mockKubernetesPolicySummaryList);
        jest.spyOn(PolicyHttpService.prototype, 'ListOrganizationControlPolicies').mockImplementation(async () => mockOrganizationControlsPolicySummaryList);
        jest.spyOn(PolicyHttpService.prototype, 'ListProxyPolicies').mockImplementation(async () => mockProxyPolicySummaryList);
        jest.spyOn(PolicyHttpService.prototype, 'ListSessionRecordingPolicies').mockImplementation(async () => mockSessionRecordingPolicySummaryList);
        jest.spyOn(PolicyHttpService.prototype, 'ListTargetConnectPolicies').mockImplementation(async () => mockTargetConnectPolicySummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['policy'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        // Loop over all console.log statement
        // We jump by 2 each time since we add a `\n\n` in between the policy outputs
        const targetConnectPolicyConsoleOutput = cleanConsoleLog(logSpy.mock.calls[0][0]);
        const kubernetesPolicyConsoleOutput = cleanConsoleLog(logSpy.mock.calls[2][0]);
        const sessionRecordingPolicyConsoleOutput = cleanConsoleLog(logSpy.mock.calls[4][0]);
        const proxyPolicyConsoleOutput = cleanConsoleLog(logSpy.mock.calls[6][0]);
        const organizationPolicyConsoleOutput = cleanConsoleLog(logSpy.mock.calls[8][0]);

        expect(targetConnectPolicyConsoleOutput).toEqual(targetConnectPolicyOutput);
        expect(kubernetesPolicyConsoleOutput).toEqual(kuberentesPolicyOutput);
        expect(sessionRecordingPolicyConsoleOutput).toEqual(sessionRecordingPolicyOutput);
        expect(proxyPolicyConsoleOutput).toEqual(proxyPolicyOuput);
        expect(organizationPolicyConsoleOutput).toEqual(organizationControlsPolicyOutput);
    });


    test('2501: Filter Kubernetes Policies', async () => {
        // Mock our policy http service
        jest.spyOn(PolicyHttpService.prototype, 'ListKubernetesPolicies').mockImplementation(async () => mockKubernetesPolicySummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['policy', '--type=kubernetes'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(kuberentesPolicyOutput);
    });

    test('2502: Filter Org Control Policies', async () => {
        // Mock our policy http service
        jest.spyOn(PolicyHttpService.prototype, 'ListOrganizationControlPolicies').mockImplementation(async () => mockOrganizationControlsPolicySummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['policy', '--type=organizationcontrols'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(organizationControlsPolicyOutput);
    });

    test('2503: Filter Proxy Policies', async () => {
        // Mock our policy http service
        jest.spyOn(PolicyHttpService.prototype, 'ListProxyPolicies').mockImplementation(async () => mockProxyPolicySummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['policy', '--type=proxy'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(proxyPolicyOuput);
    });

    test('2504: Filter Session Recording Policies', async () => {
        // Mock our policy http service
        jest.spyOn(PolicyHttpService.prototype, 'ListSessionRecordingPolicies').mockImplementation(async () => mockSessionRecordingPolicySummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['policy', '--type=sessionrecording'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(sessionRecordingPolicyOutput);
    });

    test('2505: Filter Target Connect Policies', async () => {
        // Mock our policy http service
        jest.spyOn(PolicyHttpService.prototype, 'ListTargetConnectPolicies').mockImplementation(async () => mockTargetConnectPolicySummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['policy', '--type=targetconnect'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(targetConnectPolicyOutput);
    });

});