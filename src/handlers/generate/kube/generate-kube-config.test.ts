import path from 'path';
import fc from 'fast-check';
import { withDir } from 'tmp-promise';
import { Cluster, Context, KubeConfig, User } from '@kubernetes/client-node';
import { MockProxy, mock } from 'jest-mock-extended';

import { ILogger } from 'webshell-common-ts/logging/logging.types';
import { IFilterKubeConfigService, loadKubeConfigFromString } from 'services/kube-management/kube-management.service';
import { handleGenerateKubeConfig, IGenerateKubeConfigManagementService } from 'handlers/generate/kube/generate-kube-config.handler';
import { KubeConfig as ZliKubeConfig, KubeDaemonSecurityConfig } from 'services/config/config.service.types';
import { DaemonIsRunningStatus, DaemonStatus } from 'services/daemon-management/types/daemon-status.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';

function arbZliKubeConfig(): fc.Arbitrary<ZliKubeConfig> {
    return fc.record({
        type: fc.constant('kube'),
        targetUser: fc.string({ minLength: 1 }),
        targetGroups: fc.uniqueArray(fc.string()),
        targetCluster: fc.string({ minLength: 1 }),
        localPort: fc.integer({ min: 1, max: 65535 }),
        localPid: fc.integer(),
        localHost: fc.constant('localhost'),
        controlPort: fc.integer(),
        defaultNamespace: fc.string()
    }, {
        requiredKeys: [
            'type',
            'targetUser',
            'targetGroups',
            'targetCluster',
            'localPort',
            'localPid',
            'localHost',
            'controlPort']
    }
    );
}

function arbMapOfZliKubeConfigs(): fc.Arbitrary<Map<string, ZliKubeConfig>> {
    // Create array of zli kube configs with unique target users. This is
    // required otherwise expectation will think there is more than one config,
    // but when context name is the same (due to target user being the same),
    // the second one overwrites the other one
    return fc.uniqueArray(arbZliKubeConfig(), { selector: (c) => c.targetUser, comparator: 'IsStrictlyEqual' })
        .chain(zliKubeConfigs => fc.tuple(
            fc.uniqueArray(fc.uuidV(4), {
                minLength: zliKubeConfigs.length,
                maxLength: zliKubeConfigs.length
            }),
            fc.constant(zliKubeConfigs)
        ).map(([connectionIds, zliKubeConfigs]) => {
            const result = new Map<string, ZliKubeConfig>();
            connectionIds.forEach((id, i) => result.set(id, zliKubeConfigs[i]));
            return result;
        }
        ));
}

describe('Generate kube config suite', () => {
    // Mocks
    let loggerMock: MockProxy<ILogger>;
    let kubeConfigServiceMock: MockProxy<IFilterKubeConfigService>;
    let managementServiceMock: MockProxy<IGenerateKubeConfigManagementService>;

    // Fakes
    let fakeDaemonSecurityConfig: KubeDaemonSecurityConfig;

    // Constants
    const fakeUserEmail = 'foo@gmail.com';
    // Used by non-PBT tests

    const fakeDaemonConfig: ZliKubeConfig = { type: 'kube', targetUser: 'foo', targetGroups: [], targetCluster: 'my-cluster', localPort: 5002, localPid: 60433, localHost: 'localhost', controlPort: 54720 };
    const fakeDaemonMap = new Map<string, ZliKubeConfig>([
        ['fake-connection-id', fakeDaemonConfig]
    ]);

    beforeEach(() => {
        // Each test gets a fresh mock
        loggerMock = mock<ILogger>();
        kubeConfigServiceMock = mock<IFilterKubeConfigService>();
        managementServiceMock = mock<IGenerateKubeConfigManagementService>();
        // Sane defaults (can be overridden)
        kubeConfigServiceMock.me.mockReturnValue({ email: fakeUserEmail, type: SubjectType.User } as SubjectSummary);
        kubeConfigServiceMock.getKubeDaemons.mockReturnValue({});
        managementServiceMock.getDaemonConfigs.mockReturnValue(fakeDaemonMap);
        managementServiceMock.disconnectAllDaemons.mockResolvedValue(new Map());

        // Each test gets a fresh fake with sane defaults
        fakeDaemonSecurityConfig = {
            // The path fields are not used by the SUT
            certPath: 'fakeCertPath',
            csrPath: 'fakeCsrPath',
            keyPath: 'fakeKeyPath',
            token: 'fakeToken'
        };
    });

    test('31623: Generate kube config', async () => {
        await fc.assert(
            fc.asyncProperty(arbMapOfZliKubeConfigs(), async (kubeDaemonsMap) => {
                managementServiceMock.getDaemonConfigs.mockReturnValue(kubeDaemonsMap);

                // Generate without any options that trigger file I/O
                const generatedKubeConfigAsYaml = await handleGenerateKubeConfig(
                    { outputFile: undefined, update: false, force: false },
                    fakeDaemonSecurityConfig,
                    managementServiceMock,
                    kubeConfigServiceMock,
                    loggerMock
                );

                // Generated config should still be parseable from YAML to kube
                // config
                const gotKubeConfig = loadKubeConfigFromString(generatedKubeConfigAsYaml);

                // Build expectations for generated config
                const expectedClusters: Cluster[] = [];
                const expectedContexts: Context[] = [];
                const expectedUsername = `bzero-${fakeUserEmail}`;
                for (const [_, kubeDaemonConfig] of kubeDaemonsMap) {
                    const expectedName = `bzero-${kubeDaemonConfig.targetUser}@${kubeDaemonConfig.targetCluster}`;
                    expectedClusters.push({
                        name: expectedName,
                        server: `https://localhost:${kubeDaemonConfig.localPort}`,
                        skipTLSVerify: true,
                        caData: undefined,
                        caFile: undefined
                    });
                    expectedContexts.push({
                        name: expectedName,
                        cluster: expectedName,
                        user: expectedUsername,
                        namespace: kubeDaemonConfig.defaultNamespace ? kubeDaemonConfig.defaultNamespace : undefined,
                    });
                }

                const expectedUsers: User[] = kubeDaemonsMap.size > 0 ? [{ name: expectedUsername, token: fakeDaemonSecurityConfig.token }] : [];

                expect(gotKubeConfig.clusters).toMatchObject(expectedClusters);
                expect(gotKubeConfig.contexts).toMatchObject(expectedContexts);
                expect(gotKubeConfig.users).toMatchObject(expectedUsers);
                kubeDaemonsMap.size > 0 ?
                    expect(gotKubeConfig.currentContext).toBe(expectedContexts[expectedContexts.length - 1].name)
                    : expect(gotKubeConfig.currentContext).toBeUndefined();
            })
            , { numRuns: 5000, interruptAfterTimeLimit: 45 * 1000, markInterruptAsFailure: true });
    }, 46 * 1000);

    test('493843: Generate kube config with --force option and there are no running daemons or configs stored', async () => {
        managementServiceMock.getDaemonConfigs.mockReturnValue(new Map());
        managementServiceMock.getAllDaemonStatuses.mockResolvedValue(new Map());

        // Generate with force flag
        const generatedKubeConfigAsYaml = await handleGenerateKubeConfig(
            { outputFile: undefined, update: false, force: true },
            fakeDaemonSecurityConfig,
            managementServiceMock,
            kubeConfigServiceMock,
            loggerMock
        );

        // Everything should be empty because there are no configs stored
        const gotKubeConfig = loadKubeConfigFromString(generatedKubeConfigAsYaml);
        expect(gotKubeConfig.clusters).toMatchObject([]);
        expect(gotKubeConfig.contexts).toMatchObject([]);
        expect(gotKubeConfig.users).toMatchObject([]);
        expect(gotKubeConfig.currentContext).toBeUndefined();

        // No running daemons, so disconnect should not be called
        expect(managementServiceMock.disconnectAllDaemons).not.toHaveBeenCalled();
    });

    test('493844: Generate kube config with --force option and there are running daemons', async () => {
        managementServiceMock.getDaemonConfigs.mockReturnValue(new Map());
        managementServiceMock.getAllDaemonStatuses.mockResolvedValue(new Map<string, DaemonStatus<ZliKubeConfig>>([['foo', { type: 'daemon_is_running' } as DaemonIsRunningStatus<ZliKubeConfig>]]));

        // Generate with force flag
        const generatedKubeConfigAsYaml = await handleGenerateKubeConfig(
            { outputFile: undefined, update: false, force: true },
            fakeDaemonSecurityConfig,
            managementServiceMock,
            kubeConfigServiceMock,
            loggerMock
        );

        // Everything should be empty because there are no configs stored
        const gotKubeConfig = loadKubeConfigFromString(generatedKubeConfigAsYaml);
        expect(gotKubeConfig.clusters).toMatchObject([]);
        expect(gotKubeConfig.contexts).toMatchObject([]);
        expect(gotKubeConfig.users).toMatchObject([]);
        expect(gotKubeConfig.currentContext).toBeUndefined();

        // There are running daemons, so disconnect should be called
        expect(managementServiceMock.disconnectAllDaemons).toHaveBeenCalled();
    });

    test('31624: Generate kube config with --update option and file does not exist', async () => {
        await withDir(async ({ path: tempDir }) => {
            // Change KUBECONFIG path to point to testFile in this temp dir
            const testFilePath = path.join(tempDir, 'test.yaml');
            process.env.KUBECONFIG = testFilePath;

            // Generate with update option set to true
            const result = await handleGenerateKubeConfig(
                { outputFile: undefined, update: true, force: false },
                fakeDaemonSecurityConfig,
                managementServiceMock,
                kubeConfigServiceMock,
                loggerMock
            );

            // If File I/O occurs, the function returns null
            expect(result).toBeNull();

            // Generated config should still be parseable from YAML to kube
            // config. Use loadFromFile() to ensure file is created
            const gotKubeConfig = new KubeConfig();
            expect(() => gotKubeConfig.loadFromFile(testFilePath)).not.toThrow();

            // Simple checks because PBT test has already checked these for
            // correctness
            expect(gotKubeConfig.clusters).toHaveLength(1);
            expect(gotKubeConfig.contexts).toHaveLength(1);
            expect(gotKubeConfig.users).toHaveLength(1);
            expect(gotKubeConfig.currentContext).toBeDefined();
        }, {
            // Must set to true because the tempdir is dirty
            unsafeCleanup: true
        });
    });

    test('493845: Generate kube config with --update option and file directory does not exist', async () => {
        await withDir(async ({ path: tempDir }) => {
            // Change KUBECONFIG path to point to testFile in this temp dir
            const notExistDir = 'not-exist';
            const testFilePath = path.join(tempDir, notExistDir, 'test.yaml');
            process.env.KUBECONFIG = testFilePath;

            // Generate with update option set to true
            const result = await handleGenerateKubeConfig(
                { outputFile: undefined, update: true, force: false },
                fakeDaemonSecurityConfig,
                managementServiceMock,
                kubeConfigServiceMock,
                loggerMock
            );

            // If File I/O occurs, the function returns null
            expect(result).toBeNull();

            // Generated config should still be parseable from YAML to kube
            // config. Use loadFromFile() to ensure file is created
            const gotKubeConfig = new KubeConfig();
            expect(() => gotKubeConfig.loadFromFile(testFilePath)).not.toThrow();

            // Simple checks because PBT test has already checked these for
            // correctness
            expect(gotKubeConfig.clusters).toHaveLength(1);
            expect(gotKubeConfig.contexts).toHaveLength(1);
            expect(gotKubeConfig.users).toHaveLength(1);
            expect(gotKubeConfig.currentContext).toBeDefined();
        }, {
            // Must set to true because the tempdir is dirty
            unsafeCleanup: true
        });
    });

    test('493846: Generate kube config with --update option and file does exist', async () => {
        await withDir(async ({ path: tempDir }) => {
            // Change KUBECONFIG path to point to testFile in this temp dir
            const testFilePath = path.join(tempDir, 'test.yaml');
            process.env.KUBECONFIG = testFilePath;

            // Write existing file
            const existingConfig: ZliKubeConfig = { ...fakeDaemonConfig, targetUser: 'other-user' };
            managementServiceMock.getDaemonConfigs.mockReturnValue(new Map<string, ZliKubeConfig>([['otherConnectionId', existingConfig]]));
            await handleGenerateKubeConfig(
                { outputFile: undefined, update: true, force: false },
                fakeDaemonSecurityConfig,
                managementServiceMock,
                kubeConfigServiceMock,
                loggerMock
            );

            // Generate with update option set to true
            managementServiceMock.getDaemonConfigs.mockReturnValue(fakeDaemonMap);
            const result = await handleGenerateKubeConfig(
                { outputFile: undefined, update: true, force: false },
                fakeDaemonSecurityConfig,
                managementServiceMock,
                kubeConfigServiceMock,
                loggerMock
            );

            // If File I/O occurs, the function returns null
            expect(result).toBeNull();

            // Generated config should still be parseable from YAML to kube
            // config. Use loadFromFile() to ensure file is created
            const gotKubeConfig = new KubeConfig();
            expect(() => gotKubeConfig.loadFromFile(testFilePath)).not.toThrow();

            // Simple checks because PBT test has already checked these for
            // correctness
            expect(gotKubeConfig.clusters).toHaveLength(2);
            expect(gotKubeConfig.contexts).toHaveLength(2);
            expect(gotKubeConfig.users).toHaveLength(1);
            expect(gotKubeConfig.currentContext).toBeDefined();
        }, {
            // Must set to true because the tempdir is dirty
            unsafeCleanup: true
        });
    });

    test('31626: Generate kube config with --outputFile option and file does not exist', async () => {
        await withDir(async ({ path: tempDir }) => {
            const testFilePath = path.join(tempDir, 'test.yaml');

            // Generate with outputFile option set to path above
            const result = await handleGenerateKubeConfig(
                { outputFile: testFilePath, update: false, force: false },
                fakeDaemonSecurityConfig,
                managementServiceMock,
                kubeConfigServiceMock,
                loggerMock
            );

            // If File I/O occurs, the function returns null
            expect(result).toBeNull();

            // Generated config should still be parseable from YAML to kube
            // config. Use loadFromFile() to ensure file is created
            const gotKubeConfig = new KubeConfig();
            expect(() => gotKubeConfig.loadFromFile(testFilePath)).not.toThrow();

            // Simple checks because PBT test has already checked these for
            // correctness
            expect(gotKubeConfig.clusters).toHaveLength(1);
            expect(gotKubeConfig.contexts).toHaveLength(1);
            expect(gotKubeConfig.users).toHaveLength(1);
            expect(gotKubeConfig.currentContext).toBeDefined();
        }, {
            // Must set to true because the tempdir is dirty
            unsafeCleanup: true
        });
    });
});