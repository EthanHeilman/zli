import mockArgv from 'mock-argv';
import { CliDriver } from '../../cli-driver';
import { cleanConsoleLog, mockBzeroSummaryList, mockDatSummaryList, mockDbSummaryList, mockKubeSummaryList, unitTestMockSetup, mockSsmSummaryList, mockWebSummaryList } from '../../utils/unit-test-utils';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { DbTargetHttpService } from '../../http-services/db-target/db-target.http-service';
import { WebTargetHttpService } from '../../http-services/web-target/web-target.http-service';



describe('List Targets suite', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Mock out necessary services
        unitTestMockSetup(true);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    test('2493: List all types of Targets', async () => {
        // Mock our kubernetes http service
        jest.spyOn(KubeHttpService.prototype, 'ListKubeClusters').mockImplementation(async () => mockKubeSummaryList);

        // Mock our Ssm http service
        jest.spyOn(SsmTargetHttpService.prototype, 'ListSsmTargets').mockImplementation(async () => mockSsmSummaryList);

        // Mock our bzero http service
        jest.spyOn(BzeroTargetHttpService.prototype, 'ListBzeroTargets').mockImplementation(async () => mockBzeroSummaryList);

        // Mock our db http service
        jest.spyOn(DbTargetHttpService.prototype, 'ListDbTargets').mockImplementation(async () => mockDbSummaryList);

        // Mock our web http service
        jest.spyOn(WebTargetHttpService.prototype, 'ListWebTargets').mockImplementation(async () => mockWebSummaryList);

        // Mock our DAT http service
        jest.spyOn(DynamicAccessConfigHttpService.prototype, 'ListDynamicAccessConfigs').mockImplementation(async () => mockDatSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(String.raw`┌─────────┬───────────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type    │ Name              │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ SSM     │ test-ssm-name     │ test-env-name  │ test-agent-v… │ Online  │ test-user                   │ test-region      │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Dynamic │ test-ssm-name     │ test-env-name  │ N/A           │ Online  │ test-user                   │ N/A              │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Bzero   │ test-bzero-name   │ test-env-name  │ test-agent-v… │ Online  │ test-user                   │ test-region      │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Cluster │ test-cluster-name │ test-env-name  │ test-version  │ Online  │ mock-allowed-user           │ test-region      │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Db      │ test-db-name      │ test-env-name  │ test-agent-v… │ Online  │ N/A                         │ test-region      │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Web     │ test-web-name     │ test-env-name  │ test-agent-v… │ Online  │ N/A                         │ test-region      │
└─────────┴───────────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });

    test('2494: Filter Kubernetes Targets', async () => {
        // Mock our kubernetes http service
        jest.spyOn(KubeHttpService.prototype, 'ListKubeClusters').mockImplementation(async () => mockKubeSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '--targetType=cluster', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        expect(cleanOutput).toEqual(String.raw`┌─────────┬───────────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type    │ Name              │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├─────────┼───────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Cluster │ test-cluster-name │ test-env-name  │ test-version  │ Online  │ mock-allowed-user           │ test-region      │
└─────────┴───────────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });

    test('2495: Filter Ssm Targets', async () => {
        // Mock our Ssm http service
        jest.spyOn(SsmTargetHttpService.prototype, 'ListSsmTargets').mockImplementation(async () => mockSsmSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '--targetType=ssm', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        console.log(output);
        expect(cleanOutput).toEqual(String.raw`┌──────┬───────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type │ Name          │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├──────┼───────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ SSM  │ test-ssm-name │ test-env-name  │ test-agent-v… │ Online  │ test-user                   │ test-region      │
└──────┴───────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });


    test('2496: Filter DAT Targets', async () => {
        // Mock our DAT http service
        jest.spyOn(DynamicAccessConfigHttpService.prototype, 'ListDynamicAccessConfigs').mockImplementation(async () => mockDatSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '--targetType=dynamic', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        console.log(output);
        expect(cleanOutput).toEqual(String.raw`┌─────────┬───────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type    │ Name          │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├─────────┼───────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Dynamic │ test-ssm-name │ test-env-name  │ N/A           │ Online  │ test-user                   │ N/A              │
└─────────┴───────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });

    test('2497: Filter Bzero Targets', async () => {
        // Mock our bzero http service
        jest.spyOn(BzeroTargetHttpService.prototype, 'ListBzeroTargets').mockImplementation(async () => mockBzeroSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '--targetType=bzero', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        console.log(output);
        expect(cleanOutput).toEqual(String.raw`┌───────┬─────────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type  │ Name            │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├───────┼─────────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Bzero │ test-bzero-name │ test-env-name  │ test-agent-v… │ Online  │ test-user                   │ test-region      │
└───────┴─────────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });

    test('2498: Filter Db Targets', async () => {
        // Mock our db http service
        jest.spyOn(DbTargetHttpService.prototype, 'ListDbTargets').mockImplementation(async () => mockDbSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '--targetType=db', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        console.log(output);
        expect(cleanOutput).toEqual(String.raw`┌──────┬──────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type │ Name         │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├──────┼──────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Db   │ test-db-name │ test-env-name  │ test-agent-v… │ Online  │ N/A                         │ test-region      │
└──────┴──────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });

    test('2499: Filter Web Targets', async () => {
        // Mock our web http service
        jest.spyOn(WebTargetHttpService.prototype, 'ListWebTargets').mockImplementation(async () => mockWebSummaryList);

        // Listen to our list target response
        const logSpy = jest.spyOn(console, 'log');

        // Call the function
        await mockArgv(['list-targets', '--targetType=web', '-d'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const output = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(output);
        console.log(output);
        expect(cleanOutput).toEqual(String.raw`┌──────┬───────────────┬────────────────┬───────────────┬─────────┬─────────────────────────────┬──────────────────┐
│ Type │ Name          │ Environment    │ Agent Version │ Status  │ Target Users                │ Region           │
├──────┼───────────────┼────────────────┼───────────────┼─────────┼─────────────────────────────┼──────────────────┤
│ Web  │ test-web-name │ test-env-name  │ test-agent-v… │ Online  │ N/A                         │ test-region      │
└──────┴───────────────┴────────────────┴───────────────┴─────────┴─────────────────────────────┴──────────────────┘`);
    });
});