import { systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { DbTargetService } from '..../../../http-services/db-target/db-target.http-service';
import { promisify } from 'util';
import { exec } from 'child_process';

import { configService, logger, loggerConfigService } from '../system-test';
import { DigitalOceanBZeroTarget, getDOImageName } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { bzeroTestTargetsToRun } from '../targets-to-run';
import { TestTarget } from '../system-test.types';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';

interface IperfUploadOutput {
    end: {
        sum_sent: SumSummary;
        sum_received: SumSummary
    }
}

interface IperfDownloadOutput {
    end: {
        sum_sent: SumSentDownloadSummary;
        sum_received: SumSummary
    }
}

interface SumSummary {
    start: number;
    end: number;
    seconds: number;
    bytes: number;
    bits_per_second: number;
    sender: boolean;
}

interface SumSentDownloadSummary {
    start: number;
    end: number;
    seconds: number;
    bytes: number;
    bits_per_second: number;
    retransmits: number;
    sender: boolean;
}

export const iperfSuite = () => {
    describe('Iperf suite', () => {
        let policyService: PolicyHttpService;
        let testUtils: TestUtils;

        let testPassed = false;

        const localDbPort = 6100;
        const iperfPort = 5201;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);
            testUtils = new TestUtils(configService, logger, loggerConfigService);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            await policyService.AddProxyPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'iperf-proxy'),
                subjects: [currentUser],
                groups: [],
                description: `Iperf Proxy policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: []
            });
        }, 60 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our proxy policy
            const proxyPolicies = await policyService.ListProxyPolicies();
            const proxyPolicy = proxyPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'iperf-proxy')
            );
            policyService.DeleteProxyPolicy(proxyPolicy.id);
        }, 60 * 1000);


        afterEach(async () => {
            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);

            // Always make sure our ports are free, else throw an error
            try {
                await testUtils.CheckPort(localDbPort);
            } catch (e: any) {
                // Always ensure we clean up any dangling connections if there are any errors
                await callZli(['disconnect', 'db']);

                throw e;
            }

            // Reset test passed
            testPassed = false;
        });

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.dbCaseId}: iperf upload test - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new db virtual target
                const dbTargetService: DbTargetService = new DbTargetService(configService, logger);
                const dbIperfVtName = `${doTarget.bzeroTarget.name}-db-iperf-upload-vt`;

                await dbTargetService.CreateDbTarget({
                    targetName: dbIperfVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'localhost',
                    remotePort: { value: iperfPort },
                    localHost: 'localhost',
                    localPort: { value: localDbPort },
                    environmentName: systemTestEnvName
                });

                logger.info('Creating db target connection');

                // Start the connection to the db virtual target
                await callZli(['connect', dbIperfVtName]);

                logger.info('Connecting to iperf target using iperf3');
                const pexec = promisify(exec);

                // -i pause n seconds between periodic throughput reports
                // -t time in seconds to transmit for
                const { stdout } = await pexec(`iperf3 -c 127.0.0.1 -p ${localDbPort} -i 1 -t 5 --json`);
                const iperfResult: IperfUploadOutput = JSON.parse(stdout);

                expect(iperfResult.end.sum_sent.bits_per_second).toBeGreaterThan(6000000);

                // Disconnect
                await callZli(['disconnect', 'db']);

                // Reset our testPassed flag
                testPassed = true;
            }, 60 * 1000);
        });

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.dbCaseId}: iperf download test - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new db virtual target
                const dbTargetService: DbTargetService = new DbTargetService(configService, logger);
                const dbIperfVtName = `${doTarget.bzeroTarget.name}-db-iperf-download-vt`;

                await dbTargetService.CreateDbTarget({
                    targetName: dbIperfVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'localhost',
                    remotePort: { value: iperfPort },
                    localHost: 'localhost',
                    localPort: { value: localDbPort },
                    environmentName: systemTestEnvName
                });

                logger.info('Creating db target connection');

                // Start the connection to the db virtual target
                await callZli(['connect', dbIperfVtName]);

                logger.info('Connecting to iperf target using iperf3');
                const pexec = promisify(exec);

                // -i pause n seconds between periodic throughput reports
                // -t time in seconds to transmit for
                // -R reverse test (i.e. download)
                const { stdout } = await pexec(`iperf3 -c 127.0.0.1 -p ${localDbPort} -i 1 -t 5 -R --json`);
                const iperfResult: IperfDownloadOutput = JSON.parse(stdout);

                expect(iperfResult.end.sum_received.bits_per_second).toBeGreaterThan(5000000);

                // Disconnect
                await callZli(['disconnect', 'db']);

                // Reset our testPassed flag
                testPassed = true;
            }, 60 * 1000);
        });
    });
};