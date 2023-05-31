import { Cluster, Context, KubeConfig, User } from '@kubernetes/client-node';
import fc from 'fast-check';
import fs from 'fs';

import { MockProxy, mock } from 'jest-mock-extended';
import { cloneDeep } from 'lodash';
import yaml from 'yaml';
import { filterKubeConfig, getKubeDaemonSecuritySettings, IFilterKubeConfigService, IFilterKubeDaemonManagementService, IKubeDaemonSecurityConfigService, loadKubeConfigFromFile, mergeKubeConfig } from 'services/kube-management/kube-management.service';
import { ILogger } from 'webshell-common-ts/logging/logging.types';
import { dir, DirectoryResult, withDir, withFile } from 'tmp-promise';
import { GlobalKubeConfig, KubeDaemonSecurityConfig, KubeConfig as ZliKubeConfig } from 'services/config/config.service.types';
import path from 'path';
import { randomUUID } from 'crypto';
import { DaemonIsRunningStatus, DaemonStatus } from 'services/daemon-management/types/daemon-status.types';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';

function arbUser(): fc.Arbitrary<User> {
    const baseUser: { [K in keyof User]: fc.Arbitrary<User[K]> } = { name: fc.string() };
    return fc.oneof(
        fc.record({
            ...baseUser,
            ...{
                token: fc.base64String()
            }
        }),
        fc.record({
            ...baseUser,
            ...{
                exec: fc.json().map(json => yaml.stringify(JSON.parse(json))),
            }
        })
    );
}

function arbCluster(): fc.Arbitrary<Cluster> {
    return fc.record({
        name: fc.string(),
        server: fc.webUrl(),
        skipTLSVerify: fc.boolean(),
        caData: fc.base64String()
    }, { requiredKeys: ['name', 'server', 'skipTLSVerify'] });
}

function arbContext(userChoices: string[], clusterChoices: string[]): fc.Arbitrary<Context> {
    const makeArb = (userChoices: string[], clusterChoices: string[]): fc.Arbitrary<Context> => {
        return fc.record({
            cluster: clusterChoices.length > 0 ? fc.constantFrom(...clusterChoices) : fc.string(),
            user: userChoices.length > 0 ? fc.constantFrom(...userChoices) : fc.string(),
            name: fc.string(),
            namespace: fc.string()
        }, { requiredKeys: ['cluster', 'user', 'name'] });
    };

    return fc.oneof(
        makeArb([], []), // Make a context with completely random user and cluster names
        makeArb([], clusterChoices), // Make a context with completely random user name and equiproable cluster name from choices
        makeArb(userChoices, []), // Make a context with completely random cluster name and equiprobable user name from choices,
        makeArb(userChoices, clusterChoices) // Make a context with user name and context name chosen from choices, all equiprobable
    );
}

function arbKubeConfig(): fc.Arbitrary<KubeConfig> {
    return fc
        // Create unique list of random users and clusters. Uniqueness is
        // defined as entries not having the same name
        .tuple(
            fc.uniqueArray(arbUser(), { selector: (u) => u.name, comparator: 'IsStrictlyEqual' }),
            fc.uniqueArray(arbCluster(), { selector: (c) => c.name, comparator: 'IsStrictlyEqual' })
        ).chain(([users, clusters]) =>
            // Create unique list of random contexts. There is a chance for some
            // of the generated contexts to refer to the names of users and
            // clusters generated above. Uniqueness is defined as context names
            // not having the same name.
            fc.uniqueArray(
                arbContext(
                    users.map(u => u.name),
                    clusters.map(c => c.name)
                ),
                { selector: (c) => c.name, comparator: 'IsStrictlyEqual' }
            )
                // Pick currentContext equiprobable from empty context, random
                // context, and all contexts generated above
                .chain(contexts => fc.tuple(
                    fc.oneof(
                        fc.string(),
                        fc.constantFrom('', ...contexts.map(c => c.name)),
                    ),
                    // Pass down the contexts generated, so we can still access
                    // them in final creation
                    fc.constant(contexts))
                )
                .map(([currentContext, contexts]) => {
                    const kubeConfig = new KubeConfig();
                    kubeConfig.users = users;
                    kubeConfig.clusters = clusters;
                    kubeConfig.contexts = contexts;
                    kubeConfig.currentContext = currentContext;

                    return kubeConfig;
                })
        );
}

describe('loadKubeConfigFromFile suite', () => {
    test('493828: error is thrown if kube config is invalid', async () => {
        await withFile(async ({ path: tempFilePath }) => {
            // Write invalid kube config
            const kc = new KubeConfig();
            const kcAsYaml = yaml.stringify(kc.exportConfig()) + 'null';
            fs.writeFileSync(tempFilePath, kcAsYaml);

            expect(() => loadKubeConfigFromFile(tempFilePath)).toThrow('Failed parsing kubeconfig');
        });
    });
});

describe('getKubeDaemonSecuritySettings suite', () => {
    // Mocks
    let mockConfig: MockProxy<IKubeDaemonSecurityConfigService>;
    let mockLogger: MockProxy<ILogger>;

    // Temp directory to hold generated TLS certs
    let tempDir: DirectoryResult;
    let tempConfigFilePath: string;

    beforeEach(async () => {
        mockConfig = mock<IKubeDaemonSecurityConfigService>();
        mockLogger = mock<ILogger>();

        // Create new temp dir for each test
        // Set unsafeCleanup because temp dir will contain files
        tempDir = await dir({ unsafeCleanup: true });
        tempConfigFilePath = path.join(tempDir.path, 'test.json');

        // Create certs in this temp dir
        mockConfig.getConfigPath.mockReturnValue(tempConfigFilePath);
        mockConfig.getConfigName.mockReturnValue('test');
    });

    afterEach(async () => {
        await tempDir.cleanup();
    });

    test('493830: generate new settings when config is not set', async () => {
        mockConfig.getGlobalKubeConfig.mockReturnValue({ defaultTargetGroups: [], securitySettings: undefined });

        const settings = await getKubeDaemonSecuritySettings(mockConfig, mockLogger);

        // Ensure we update value via config service and that it matches the
        // return value
        expect(mockConfig.setGlobalKubeConfig).toHaveBeenCalledWith(expect.objectContaining<GlobalKubeConfig>(
            { securitySettings: settings, defaultTargetGroups: [] }
        ));

        // Ensure paths for generated files match base directory of fake config
        // file
        const dirName = path.dirname(tempConfigFilePath);

        // It seems like the expect statement will auto-escape \ in the expect string
        // but not in the regular expression which makes the command fail on Windows.
        // The below replacement compensates for that.
        const replacedDirName = dirName.split(`\\`).join(`\\\\`);

        const configPathPattern = new RegExp(`^${replacedDirName}`);
        expect(settings.certPath).toMatch(configPathPattern);
        expect(settings.keyPath).toMatch(configPathPattern);
        expect(settings.csrPath).toMatch(configPathPattern);

        expect(settings.token).toBeDefined();

        // Check files have been written to disk
        expect(fs.existsSync(settings.certPath)).toBe(true);
        expect(fs.existsSync(settings.keyPath)).toBe(true);
        expect(fs.existsSync(settings.csrPath)).toBe(true);
    });

    test('493831: generate new settings when force option is provided', async () => {
        const storedSettings: KubeDaemonSecurityConfig = { certPath: 'foo', csrPath: 'bar', keyPath: 'baz', token: 'fakeToken' };
        mockConfig.getGlobalKubeConfig.mockReturnValue({ defaultTargetGroups: [], securitySettings: storedSettings });
        // Must make clone to use for assertions, so if test changes passed in
        // value, we will see.
        const notExpectedSettings = cloneDeep(storedSettings);

        // Pass force flag
        const settings = await getKubeDaemonSecuritySettings(mockConfig, mockLogger, true);

        // Ensure we update value via config service and that it matches the
        // return value
        expect(mockConfig.setGlobalKubeConfig).toHaveBeenCalledWith(expect.objectContaining<GlobalKubeConfig>(
            { securitySettings: settings, defaultTargetGroups: [] }
        ));

        // Ensure paths for generated files match base directory of fake config
        // file
        const dirName = path.dirname(tempConfigFilePath);

        // It seems like the expect statement will auto-escape \ in the expect string
        // but not in the regular expression which makes the command fail on Windows.
        // The below replacement compensates for that.
        const replacedDirName = dirName.split(`\\`).join(`\\\\`);

        const configPathPattern = new RegExp(`^${replacedDirName}`);
        expect(settings.certPath).toMatch(configPathPattern);
        expect(settings.keyPath).toMatch(configPathPattern);
        expect(settings.csrPath).toMatch(configPathPattern);

        expect(settings.token).toBeDefined();

        // Check files have been written to disk
        expect(fs.existsSync(settings.certPath)).toBe(true);
        expect(fs.existsSync(settings.keyPath)).toBe(true);
        expect(fs.existsSync(settings.csrPath)).toBe(true);

        // Settings should not match what was stored prior because we passed
        // force flag
        expect(settings).not.toMatchObject<KubeDaemonSecurityConfig>(notExpectedSettings);
    });

    test('493832: do not update anything when config is set and all files exist', async () => {
        const tempFilePath = path.join(tempDir.path, 'testFile.txt');
        const contentsBeforeCall = 'foo';
        fs.writeFileSync(tempFilePath, contentsBeforeCall);

        // Mock config service to return config with paths to files that
        // exist
        const storedSettings: KubeDaemonSecurityConfig = { certPath: tempFilePath, csrPath: tempFilePath, keyPath: tempFilePath, token: 'fakeToken' };
        mockConfig.getGlobalKubeConfig.mockReturnValue({ defaultTargetGroups: [], securitySettings: storedSettings });
        // Must make clone to use for assertions, so if test changes passed
        // in value, we will see.
        const expectedSettings = cloneDeep(storedSettings);

        const settings = await getKubeDaemonSecuritySettings(mockConfig, mockLogger);

        // We shouldn't update anything, in settings and on disk
        expect(mockConfig.setGlobalKubeConfig).not.toHaveBeenCalled();
        expect(fs.readFileSync(settings.certPath).toString()).toBe(contentsBeforeCall);
        expect(fs.readFileSync(settings.csrPath).toString()).toBe(contentsBeforeCall);
        expect(fs.readFileSync(settings.keyPath).toString()).toBe(contentsBeforeCall);

        // We should return what we've stored in config before calling
        expect(settings).toMatchObject<KubeDaemonSecurityConfig>(expectedSettings);
    });

    test.each([
        { certPathExists: false, csrPathExists: true, keyPathExists: true },
        { certPathExists: true, csrPathExists: false, keyPathExists: true },
        { certPathExists: true, csrPathExists: true, keyPathExists: false },
        { certPathExists: false, csrPathExists: false, keyPathExists: true },
        { certPathExists: true, csrPathExists: false, keyPathExists: false },
        { certPathExists: false, csrPathExists: true, keyPathExists: false },
        { certPathExists: false, csrPathExists: false, keyPathExists: false },
    ])(`493833: update certs and key files if at least one file does not exist: %s`, async ({ certPathExists, csrPathExists, keyPathExists }) => {
        // Make new temp dir to store existing files
        await withDir(async ({ path: anotherTempDir }) => {
            const fakeToken = 'fakeToken';
            const storedSettings: KubeDaemonSecurityConfig = {
                token: fakeToken,
                csrPath: path.join(anotherTempDir, 'csrFile'),
                keyPath: path.join(anotherTempDir, 'keyFile'),
                certPath: path.join(anotherTempDir, 'certFile'),
            };

            // Write files if case says to
            const contentsBeforeCall = 'foo';
            if (certPathExists)
                fs.writeFileSync(storedSettings.certPath, contentsBeforeCall);
            if (csrPathExists)
                fs.writeFileSync(storedSettings.csrPath, contentsBeforeCall);
            if (keyPathExists)
                fs.writeFileSync(storedSettings.keyPath, contentsBeforeCall);

            mockConfig.getGlobalKubeConfig.mockReturnValue({ defaultTargetGroups: [], securitySettings: storedSettings });

            const settings = await getKubeDaemonSecuritySettings(mockConfig, mockLogger);

            // Ensure we update value via config service and that it matches the
            // return value
            expect(mockConfig.setGlobalKubeConfig).toHaveBeenCalledWith(expect.objectContaining<GlobalKubeConfig>(
                { securitySettings: settings, defaultTargetGroups: [] }
            ));

            // Ensure paths for generated files match base directory of fake
            // config file
            const dirName = path.dirname(tempConfigFilePath);

            // It seems like the expect statement will auto-escape \ in the expect string
            // but not in the regular expression which makes the command fail on Windows.
            // The below replacement compensates for that.
            const replacedDirName = dirName.split(`\\`).join(`\\\\`);

            const configPathPattern = new RegExp(`^${replacedDirName}`);
            expect(settings.certPath).toMatch(configPathPattern);
            expect(settings.keyPath).toMatch(configPathPattern);
            expect(settings.csrPath).toMatch(configPathPattern);

            // Token should not be modified
            expect(settings.token).toBe(fakeToken);

            // Check files have been written to disk and do not match what was
            // stored before
            expect(fs.readFileSync(settings.certPath).toString()).not.toBe(contentsBeforeCall);
            expect(fs.readFileSync(settings.csrPath).toString()).not.toBe(contentsBeforeCall);
            expect(fs.readFileSync(settings.keyPath).toString()).not.toBe(contentsBeforeCall);
        }, { unsafeCleanup: true });
    });
});

describe('filterKubeConfig suite', () => {
    // Mocks
    let mockConfig: MockProxy<IFilterKubeConfigService>;
    let mockKubeDaemonManagementService: MockProxy<IFilterKubeDaemonManagementService>;

    const bzeroEmail = 'foo@gmail.com';
    const bzeroUsername = 'bzero-' + bzeroEmail;

    beforeEach(() => {
        mockConfig = mock<IFilterKubeConfigService>();
        mockKubeDaemonManagementService = mock<IFilterKubeDaemonManagementService>();

        // Sane defaults
        mockKubeDaemonManagementService.getDaemonConfigs.mockReturnValue(new Map());
        mockKubeDaemonManagementService.getAllDaemonStatuses.mockResolvedValue(new Map());

        mockConfig.me.mockReturnValue(Promise.resolve({ email: bzeroEmail } as SubjectSummary));
    });

    const makeBzeroContextsAndClusters = (ports: number[]): [Context[], Cluster[]] => {
        const baseBzeroContext: Context = {
            name: 'bzero-context',
            user: bzeroUsername,
            cluster: 'bzero-cluster'
        };
        const bzeroContexts: Context[] = [];
        for (let i = 0; i < ports.length; i++) {
            bzeroContexts.push({
                ...baseBzeroContext,
                ...{
                    name: baseBzeroContext.name + `-${i}`,
                    cluster: baseBzeroContext.cluster + `-${i}`
                }
            });
        }

        const baseBzeroCluster: Cluster = {
            name: 'bzero-cluster',
            server: 'https://localhost:',
            skipTLSVerify: true
        };
        const bzeroClusters: Cluster[] = [];
        for (let i = 0; i < ports.length; i++) {
            bzeroClusters.push({
                ...baseBzeroCluster,
                ...{
                    name: baseBzeroCluster.name + `-${i}`,
                    server: baseBzeroCluster.server + ports[i].toString()
                }
            });
        }

        return [bzeroContexts, bzeroClusters];
    };

    test('493834: filter stale cluster and context entries when there is at least one daemon still running', async () => {
        const stalePorts = [1, 22, 1000];
        const alivePorts = [441, 442, 443];
        const [contexts, clusters] = makeBzeroContextsAndClusters(stalePorts.concat(alivePorts));

        // We concated the two arrays, so everything after stalePorts length are
        // alive
        const aliveContexts = contexts.slice(stalePorts.length);
        const aliveClusters = clusters.slice(stalePorts.length);

        const bzeroUser: User = { name: bzeroUsername };

        const kc = new KubeConfig();
        kc.users = [bzeroUser];
        kc.clusters = clusters;
        kc.contexts = contexts;

        // When building expected ports, daemons with the alivePorts will be
        // returned
        mockKubeDaemonManagementService.getDaemonConfigs.mockReturnValue(new Map(alivePorts.map<[string, ZliKubeConfig]>((port) => [randomUUID(), { localPort: port} as ZliKubeConfig ])));
        // Make it so there is at least one daemon running. UUID here does not
        // match the one above, but it doesn't matter because it's enough to
        // simulate at least one daemon running
        mockKubeDaemonManagementService.getAllDaemonStatuses.mockResolvedValue(new Map<string, DaemonStatus<ZliKubeConfig>>([[randomUUID(), { type: 'daemon_is_running' } as DaemonIsRunningStatus<ZliKubeConfig>]]));

        const filterResult = await filterKubeConfig(mockConfig, mockKubeDaemonManagementService, kc);
        expect(filterResult.filteredKubeConfig.clusters).toMatchObject(aliveClusters);
        expect(filterResult.filteredKubeConfig.contexts).toMatchObject(aliveContexts);

        // Bzero user should still exist because at least one daemon is still
        // running
        expect(filterResult.filteredKubeConfig.users).toMatchObject([bzeroUser]);
    });

    test('493835: filter stale cluster and context entries when no more daemons running', async () => {
        // Create kube config with only bzero entries and they're all stale
        const stalePorts = [1, 22, 34, 50, 5000];
        const [staleContexts, staleClusters] = makeBzeroContextsAndClusters(stalePorts);
        // Add an extra context to simulate multiple contexts pointing to same
        // cluster
        staleContexts.push({ ...staleContexts[0], ...{ name: 'copiedContext' } });
        const kc = new KubeConfig();
        kc.users = [{ name: bzeroUsername }];
        kc.clusters = staleClusters;
        kc.contexts = staleContexts;

        const filterResult = await filterKubeConfig(mockConfig, mockKubeDaemonManagementService, kc);
        expect(filterResult.filteredKubeConfig.clusters).toMatchObject([]);
        expect(filterResult.filteredKubeConfig.contexts).toMatchObject([]);
        expect(filterResult.filteredKubeConfig.users).toMatchObject([]);
    });

    test('493836: filtering does not mutate provided config', async () => {
        await fc.assert(
            fc.asyncProperty(arbKubeConfig(), async (config) => {
                const clonedConfig = cloneDeep(config);
                await filterKubeConfig(mockConfig, mockKubeDaemonManagementService, config);
                expect(config).toEqual<KubeConfig>(clonedConfig);
            })
        );
    });

    test('493837: filtering does not remove any entry if there are no bzero entries', async () => {
        await fc.assert(
            fc.asyncProperty(arbKubeConfig(), async (config) => {
                fc.pre(!config.contexts.map(c => c.user).some(userName => userName.startsWith('bzero')));
                const clonedConfig = cloneDeep(config);
                const filterResult = await filterKubeConfig(mockConfig, mockKubeDaemonManagementService, config);
                expect(filterResult.filteredKubeConfig).toMatchObject(clonedConfig);
            })
            , { numRuns: 5000, interruptAfterTimeLimit: 30 * 1000, markInterruptAsFailure: true });
    }, 31 * 1000);
});

describe('merge properties', () => {
    test('493838: merging does not mutate provided configs', () => {
        fc.assert(
            fc.property(arbKubeConfig(), arbKubeConfig(), (configOne, configTwo) => {
                const clonedConfigOne = cloneDeep(configOne);
                const clonedConfigTwo = cloneDeep(configTwo);
                mergeKubeConfig(configOne, configTwo);
                expect(configOne).toEqual<KubeConfig>(clonedConfigOne);
                expect(configTwo).toEqual<KubeConfig>(clonedConfigTwo);
            })
        );
    });

    test('493839: merged config contains all entries from destination config', () => {
        fc.assert(
            fc.property(arbKubeConfig(), arbKubeConfig(), (configOne, configTwo) => {
                const mergedConfig = mergeKubeConfig(configOne, configTwo);

                expect(mergedConfig.clusters).toEqual<Cluster[]>(expect.arrayContaining(configTwo.clusters));
                expect(mergedConfig.users).toEqual<User[]>(expect.arrayContaining(configTwo.users));
                expect(mergedConfig.contexts).toEqual<Context[]>(expect.arrayContaining(configTwo.contexts));

                // Destination config's currentContext is only used if it is set
                configTwo.currentContext ?
                    expect(mergedConfig.currentContext).toEqual(configTwo.currentContext)
                    : expect(mergedConfig.currentContext).toEqual(configOne.currentContext);
            })
        );
    });

    describe('destination entries take precedence if source config has matching entry', () => {
        const makeTest = (entryType: 'contexts' | 'users' | 'clusters') => {
            test(`493840: ${entryType} take precedence`, () => {
                fc.assert(
                    fc.property(fc.tuple(arbKubeConfig().filter(c => c[entryType].length > 0), fc.string({ minLength: 1 }))
                        .chain(([configOne, randString]) => {
                            const configTwo = cloneDeep(configOne);
                            const commonEntry = configOne[entryType][0];

                            let castedCommonEntry = undefined;
                            let modifiedEntry: Cluster | Context | User = undefined;
                            switch (entryType) {
                            case 'clusters':
                                castedCommonEntry = commonEntry as Cluster;
                                modifiedEntry = { ...castedCommonEntry, server: castedCommonEntry.server ? castedCommonEntry.server + randString : randString };
                                configTwo[entryType].push(modifiedEntry);
                                break;
                            case 'contexts':
                                castedCommonEntry = commonEntry as Context;
                                modifiedEntry = { ...castedCommonEntry, namespace: castedCommonEntry.namespace ? castedCommonEntry.namespace + randString : randString };
                                configTwo[entryType].push(modifiedEntry);
                                break;
                            case 'users':
                                castedCommonEntry = commonEntry as User;
                                modifiedEntry = { ...castedCommonEntry, token: castedCommonEntry.token ? castedCommonEntry.token + randString : randString };
                                configTwo[entryType].push(modifiedEntry);
                                break;
                            };

                            return fc.tuple(fc.constant(configOne), fc.constant(configTwo), fc.constant(modifiedEntry));
                        }), ([configOne, configTwo, entry]) => {
                        const mergedConfig = mergeKubeConfig(configOne, configTwo);
                        expect(mergedConfig[entryType]).not.toEqual(expect.arrayContaining([configOne[entryType][0]]));
                        expect(mergedConfig[entryType]).toEqual(expect.arrayContaining([entry]));
                    }
                    )
                );
            });
        };

        makeTest('contexts');
        makeTest('clusters');
        makeTest('users');
    });

    describe('source config entries are preserved if destination config does not have matching entry', () => {
        const makeTest = (entryType: 'contexts' | 'users' | 'clusters') => {
            test(`493841: ${entryType} are preserved`, () => {
                fc.assert(
                    fc.property(arbKubeConfig(), arbKubeConfig(), (configOne, configTwo) => {
                        // Filter for generated kube configs such that the first
                        // config has at least one entry that the second config
                        // does not have
                        const configTwoEntries = new Set(Array.from(configTwo[entryType].map(c => c.name)));
                        const uniqueConfigOneEntry = configOne[entryType].map(c => c.name).find(c => !configTwoEntries.has(c));
                        fc.pre(!!uniqueConfigOneEntry);

                        const mergedConfig = mergeKubeConfig(configOne, configTwo);
                        expect(mergedConfig[entryType]).toEqual(expect.arrayContaining([expect.objectContaining({ name: uniqueConfigOneEntry })]));
                    })
                );
            });
        };

        makeTest('contexts');
        makeTest('clusters');
        makeTest('users');
    });

    test('493842: merged config contains no duplicate entries', () => {
        fc.assert(
            fc.property(arbKubeConfig(), arbKubeConfig(), (configOne, configTwo) => {
                const mergedConfig = mergeKubeConfig(configOne, configTwo);
                const isArrayUnique = <T>(arr: T[]) => new Set(arr).size === arr.length;

                expect(isArrayUnique(mergedConfig.clusters.map(c => c.name))).toBeTruthy();
                expect(isArrayUnique(mergedConfig.users.map(u => u.name))).toBeTruthy();
                expect(isArrayUnique(mergedConfig.contexts.map(c => c.name))).toBeTruthy();
            })
        );
    });
});

