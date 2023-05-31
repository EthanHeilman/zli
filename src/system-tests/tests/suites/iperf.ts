import { promisify } from 'util';
import { exec } from 'child_process';

import { OPA_SYNC_TIME, systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from 'system-tests/tests/system-test';
import { callZli } from 'system-tests/tests/utils/zli-utils';
import { DbTargetHttpService } from 'http-services/db-target/db-target.http-service';
import { configService, logger } from 'system-tests/tests/system-test';
import { DigitalOceanBZeroTarget, getDOImageName } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { bzeroTestTargetsToRun } from 'system-tests/tests/targets-to-run';
import { TestTarget } from 'system-tests/tests/system-test.types';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { setupBackgroundDaemonMocks } from 'system-tests/tests/utils/connect-utils';
import { sleepTimeout } from '../utils/test-utils';
import { AddNewDbTargetRequest } from 'webshell-common-ts/http/v2/target/db/requests/add-new-db-target.requests';
import { AddNewDbTargetResponse } from 'webshell-common-ts/http/v2/target/db/responses/add-new-db-target.responses';

const findPort = require('find-open-port');

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

        const iperfPort = 5201;

        // Set up the policy before all the tests
        beforeAll(async () => {
            // Construct all http services needed to run tests
            policyService = new PolicyHttpService(configService, logger);

            const me = await configService.me();
            const currentSubject: Subject = {
                id: me.id,
                type: me.type
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            await policyService.AddProxyPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'iperf-proxy'),
                subjects: [currentSubject],
                groups: [],
                description: `Iperf Proxy policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: []
            });

            await sleepTimeout(OPA_SYNC_TIME);
        }, 60 * 1000);

        beforeEach(() => {
            setupBackgroundDaemonMocks();
        });

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
            // Always cleanup db daemons
            await callZli(['disconnect', 'db', '--silent']);
        });

        const createDbTarget = async(dbTargetService: DbTargetHttpService, req: AddNewDbTargetRequest): Promise<AddNewDbTargetResponse> => {
            const response = await dbTargetService.CreateDbTarget(req);

            // Wait for OPA to sync environment resource changes. When a new
            // virtual target is created it will automatically create a new
            // environment_resource that maps that virtual target to an
            // environment and this must also be propagated to OPA before
            // attempting to connect to this virtual target
            await sleepTimeout(OPA_SYNC_TIME);

            return response;
        };

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.iperfUpload}: iperf upload test - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new db virtual target
                const dbTargetService: DbTargetHttpService = new DbTargetHttpService(configService, logger);
                const dbIperfVtName = `${doTarget.bzeroTarget.name}-db-iperf-upload-vt`;

                const daemonLocalPort = await findPort();
                await createDbTarget(dbTargetService, {
                    targetName: dbIperfVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'localhost',
                    remotePort: { value: iperfPort },
                    localHost: 'localhost',
                    localPort: { value: daemonLocalPort },
                    environmentName: systemTestEnvName
                });

                logger.info('Creating db target connection');

                // Start the connection to the db virtual target
                await callZli(['connect', dbIperfVtName]);

                logger.info('Connecting to iperf target using iperf3');
                const pexec = promisify(exec);

                // -i pause n seconds between periodic throughput reports
                // -t time in seconds to transmit for
                const { stdout } = await pexec(`iperf3 -c 127.0.0.1 -p ${daemonLocalPort} -i 1 -t 5 --json`);
                const iperfResult: IperfUploadOutput = JSON.parse(stdout);

                expect(iperfResult.end.sum_sent.bits_per_second).toBeGreaterThan(6000000);

                // Disconnect
                await callZli(['disconnect', 'db']);
            }, 60 * 1000);
        });

        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) => {
            it(`${testTarget.iperfDownload}: iperf download test - ${testTarget.awsRegion} - ${getDOImageName(testTarget.dropletImage)}`, async () => {
                const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

                // Create a new db virtual target
                const dbTargetService: DbTargetHttpService = new DbTargetHttpService(configService, logger);
                const dbIperfVtName = `${doTarget.bzeroTarget.name}-db-iperf-download-vt`;

                const daemonLocalPort = await findPort();
                await createDbTarget(dbTargetService, {
                    targetName: dbIperfVtName,
                    proxyTargetId: doTarget.bzeroTarget.id,
                    remoteHost: 'localhost',
                    remotePort: { value: iperfPort },
                    localHost: 'localhost',
                    localPort: { value: daemonLocalPort },
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
                const { stdout } = await pexec(`iperf3 -c 127.0.0.1 -p ${daemonLocalPort} -i 1 -t 5 -R --json`);
                const iperfResult: IperfDownloadOutput = JSON.parse(stdout);

                expect(iperfResult.end.sum_received.bits_per_second).toBeGreaterThan(5000000);

                // Disconnect
                await callZli(['disconnect', 'db']);
            }, 60 * 1000);
        });
    });
};