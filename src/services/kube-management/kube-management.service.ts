import fs from 'fs';
import { withFile } from 'tmp-promise';
import k8s, { KubeConfig } from '@kubernetes/client-node';
import { ConfigService } from '../config/config.service';
import { FilterKubeConfigResult, UserKubeConfig } from './kube-management.service.types';
import { GlobalKubeConfig, KubeConfig as ZliKubeConfig } from '../../services/config/config.service.types';
import path from 'path';
import { DaemonTLSCert, generateNewCert } from '../../utils/daemon-utils';
import randtoken from 'rand-token';
import { KubeDaemonSecurityConfig } from '../config/config.service.types';
import yaml from 'yaml';
import { findRunningDaemonWithPredicate, IDaemonStatusRetriever, KubeDaemonStore, newKubeDaemonManagementService } from '../daemon-management/daemon-management.service';
import { cloneDeep } from 'lodash';
import { ILogger } from '../../../webshell-common-ts/logging/logging.types';
import { newClusters, newContexts, newUsers } from '@kubernetes/client-node/dist/config_types';
import { SubjectSummary } from '../../../webshell-common-ts/http/v2/subject/types/subject-summary.types';

/**
 * NamedKubeEntry represents a named entry in a standard kubeconfig file, e.g.
 * cluster, context, or user
 */
interface NamedKubeEntry {
    name: string;
}

/**
 * Convert a kube config to YAML
 * @param kubeConfig Kube config to convert
 * @returns YAML-encoded string
 */
export function exportKubeConfigToYaml(kubeConfig: k8s.KubeConfig): string {
    return yaml.stringify(JSON.parse(kubeConfig.exportConfig()), { version: '1.2' });
}

export interface IKubeConfigService {
    getConfigName(): string;
    me(): SubjectSummary;
}

/**
 * Get prefix string used for BastionZero-managed entries in a kubeconfig file
 */
function getKubeConfigNamePrefix(configService: IKubeConfigService): string {
    const configName = configService.getConfigName();

    let prefix: string = '';
    if (configName === 'dev' || configName === 'stage') {
        // Only add configName if not in prod
        prefix = `${configName}-bzero-`;
    } else {
        prefix = 'bzero-';
    }

    return prefix;
}

/**
 * Get username for BastionZero-managed user entry in a kubeconfig file
 */
function getKubeConfigUsername(configService: IKubeConfigService): string {
    return getKubeConfigNamePrefix(configService) + configService.me().email;
}

/**
 * Generates a kube configuration for a specific target name, target user, and
 * daemon port combination. The resulting configuration has both the cluster and
 * context entries set, and a BastionZero-managed user entry that is shared
 * among all generated kube configs. All BastionZero-managed entries in a
 * kubeconfig include a "bzero-" prefix.
 * @param configService Config service
 * @param targetName Name of BastionZero Kubernetes target
 * @param targetUser Name of the impersonated Kubernetes RBAC user
 * @param daemonPort Port number of running Kube daemon
 * @param daemonToken Token the kube daemon is configured to validate on
 * incoming requests
 * @param defaultNamespace Default namespace to assign to generated context.
 * @returns A kube config with a cluster and context entry for this Kubernetes
 * target, and a user entry to authenticate to this target's daemon
 */
export function generateKubeConfig(
    configService: IKubeConfigService,
    targetName: string,
    targetUser: string,
    daemonPort: number,
    daemonToken: string,
    defaultNamespace?: string
): KubeConfig {
    // Get prefix
    const prefix = getKubeConfigNamePrefix(configService);

    // Configure names.
    const identifyingName = prefix + targetUser + '@' + targetName;
    const clusterName = identifyingName;
    const contextName = identifyingName;
    const userName = getKubeConfigUsername(configService);

    // Now generate a kubeConfig
    const clientKubeConfig = new KubeConfig();
    clientKubeConfig.addCluster({
        name: clusterName,
        server: `https://localhost:${daemonPort}`,
        skipTLSVerify: true
    });
    clientKubeConfig.addContext({
        cluster: clusterName,
        user: userName,
        name: contextName,
        namespace: defaultNamespace
    });
    clientKubeConfig.addUser({
        name: userName,
        token: daemonToken
    });
    clientKubeConfig.setCurrentContext(contextName);

    return clientKubeConfig;
}

export interface IKubeDaemonSecurityConfigService {
    getGlobalKubeConfig(): GlobalKubeConfig;
    setGlobalKubeConfig(config: GlobalKubeConfig): void;
    getConfigPath(): string;
    getConfigName(): string;
}

/**
 * Loads kube daemon security settings from config service. If settings are
 * empty or invalid (e.g. files do not exist), then a new cert+key are generated
 * and saved to config.
 * @param configService Config service
 * @param logger Logger
 * @param force Forces re-generation of security settings, no matter what.
 * Defaults to false
 * @returns Valid kube security settings
 */
export async function getKubeDaemonSecuritySettings(
    configService: IKubeDaemonSecurityConfigService,
    logger: ILogger,
    force: boolean = false
): Promise<KubeDaemonSecurityConfig> {
    // Load global config settings
    const kubeGlobalConfig = configService.getGlobalKubeConfig();

    const generateKubeDaemonTLSCert = async (): Promise<DaemonTLSCert> => {
        const pathToConfig = path.dirname(configService.getConfigPath());
        const configName = configService.getConfigName();

        return generateNewCert(pathToConfig, 'kube', configName);
    };

    const generateAll = async () => {
        // Generate a token that can be used for auth
        const token = randtoken.generate(128);
        const newCert = await generateKubeDaemonTLSCert();
        const generatedConfig: KubeDaemonSecurityConfig = {
            certPath: newCert.pathToCert,
            csrPath: newCert.pathToCsr,
            keyPath: newCert.pathToKey,
            token: token
        };

        // Update global config with generated security config
        kubeGlobalConfig.securitySettings = generatedConfig;
        configService.setGlobalKubeConfig(kubeGlobalConfig);

        return generatedConfig;
    };

    // Validate existing security settings
    if (force) {
        logger.info('Force flag provided. Generating new keys and cert for local daemon...');

        return generateAll();
    } else if (kubeGlobalConfig.securitySettings) {
        // Validate files still exist
        if (!fs.existsSync(kubeGlobalConfig.securitySettings.certPath) ||
            !fs.existsSync(kubeGlobalConfig.securitySettings.csrPath) ||
            !fs.existsSync(kubeGlobalConfig.securitySettings.keyPath)
        ) {
            logger.warn('Notice: Configured keys and certs for kube daemon are invalid. Generating new keys and cert for local daemon...');

            // If at least one of the files as stored in our config does not
            // exist, we should re-generate
            const newCert = await generateKubeDaemonTLSCert();

            // Update global config with new cert + key + csr key paths
            //
            // Note: Existing daemons using old certs should still be accessible
            // because
            // 1) The daemon loads certs from disk at startup
            // 2) Kubectl client configuration does not validate TLS anyways
            // 3) We haven't changed the previously generated token (should
            //    still be valid), so BastionZero user entry in kube config
            //    should still have correct token
            kubeGlobalConfig.securitySettings.certPath = newCert.pathToCert;
            kubeGlobalConfig.securitySettings.csrPath = newCert.pathToCsr;
            kubeGlobalConfig.securitySettings.keyPath = newCert.pathToKey;
            configService.setGlobalKubeConfig(kubeGlobalConfig);

            return kubeGlobalConfig.securitySettings;
        }

        // Otherwise, don't regenerate as files exist and are considered valid
        logger.debug('Configured keys and certs for kube daemon are valid');
        return kubeGlobalConfig.securitySettings;
    } else {
        // If security settings config is empty (e.g. new user), then generate
        logger.info('No kube config has been generated before, generating key and cert for local daemon...');

        return generateAll();
    }
}

/**
 * Updates the config found at filePath with the provided config. See
 * updateUserKubeConfigWith() for more details.
 * @param config Kube configuration (YAML) to write or merge
 * @param filePath Filepath of the kube config to merge with. If file does not
 * exist, config is still written to this path.
 */
export async function updateKubeConfigWith(config: k8s.KubeConfig, filePath: string): Promise<void> {
    const loadedKubeConfig = loadKubeConfigFromFile(filePath);

    const mergedKubeConfig = mergeKubeConfig(loadedKubeConfig, config);
    await writeKubeConfigTo(mergedKubeConfig, filePath);
}

/**
 * Load a kube config from disk. If no file exists, an empty kube config is
 * returned.
 * @param filePath Filepath to load
 * @returns Kube config
 */
export function loadKubeConfigFromFile(filePath: string): k8s.KubeConfig {
    // We must wrap k8s.loadFromFile() because it throws an error if file does
    // not exist
    if (!fs.existsSync(filePath)) {
        return new KubeConfig();
    } else {
        try {
            return loadKubeConfigFromString(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            e.message = `Failed parsing kubeconfig: ${e.message}`;
            throw e;
        }
    }
}

/**
 * Converts YAML-encoded kubeconfig into typed object. Throws an error if
 * something is invalid
 * @param config YAML-encoded kubeconfig
 * @returns KubeConfig object
 */
export function loadKubeConfigFromString(config: string): k8s.KubeConfig {
    // Source:
    // https://github.com/kubernetes-client/javascript/blob/f215e3dd6112261a960edb5e6401e13898de8384/src/config.ts#L170
    // Same code as link above, except we use a different yaml library which
    // doesn't have issues with certain date-like strings
    // See here: https://github.com/eemeli/yaml/issues/117
    const loadedKubeConfig = new KubeConfig();
    const obj = yaml.parse(config, { version: '1.2' });
    loadedKubeConfig.clusters = newClusters(obj.clusters);
    loadedKubeConfig.contexts = newContexts(obj.contexts);
    loadedKubeConfig.users = newUsers(obj.users);
    loadedKubeConfig.currentContext = obj['current-context'];
    return loadedKubeConfig;
}

/**
 * Updates the user's kube config with the provided config. The config is
 * merged/flattened with the existing config at that filepath. The config is
 * still written to disk even if the user's kubeconfig does not exist. See
 * loadUserKubeConfig() for definition of a user's kube config.
 *
 * If a previous cluster, context, or user configuration exists with the same
 * name at the specified path, the existing configuration is overwritten with
 * the new configuration. See mergeKubeConfig() for more details.
 *
 * @param config Kube configuration (YAML) to write or merge
 * @returns Filepath created or updated
 */
export async function updateUserKubeConfigWith(config: k8s.KubeConfig): Promise<string> {
    const userKubeConfig = await loadUserKubeConfig();

    const mergedKubeConfig = mergeKubeConfig(userKubeConfig.kubeConfig, config);
    await writeKubeConfigTo(mergedKubeConfig, userKubeConfig.filePath);

    return userKubeConfig.filePath;
}

/**
 * Load user's kube config from disk. The user's kube config is defined as one
 * of the following in descending priority:
 *
 * (1) The first filepath in KUBECONFIG env-var
 *
 * (2) The default kube config filepath (~/.kube/config)
 *
 * @returns The user's kube config. If the file does not exist, then an empty
 * KubeConfig is returned.
 */
export async function loadUserKubeConfig(): Promise<UserKubeConfig> {
    // Get filepath
    let userKubeConfigFilePath: string = undefined;
    if (process.env.KUBECONFIG && process.env.KUBECONFIG.length > 0) {
        // Source: https://github.com/kubernetes-client/javascript/blob/45b68c98e62b6cc4152189b9fd4a27ad32781bc4/src/config.ts#L303-L304

        // When examining KUBECONFIG, only respect the first entry like the aws
        // CLI
        const parsedKubeConfigFilePaths = process.env.KUBECONFIG.split(path.delimiter).filter((filename: string) => filename);
        userKubeConfigFilePath = parsedKubeConfigFilePaths[0];
    } else {
        // Otherwise, set to default kube config file path
        const homedir = (process.platform === 'win32') ? process.env.HOMEPATH : process.env.HOME;
        userKubeConfigFilePath = path.join(homedir, '.kube', 'config');
    }

    const userKubeConfig = loadKubeConfigFromFile(userKubeConfigFilePath);

    return {
        kubeConfig: userKubeConfig,
        filePath: userKubeConfigFilePath
    };
}

/**
 * Write kubeConfig to filePath
 * @param kubeConfig The kube configuration to write to disk
 * @param filePath The filepath to write the kubeconfig to
 */
async function writeKubeConfigTo(kubeConfig: k8s.KubeConfig, filePath: string): Promise<void> {
    await withFile(async ({ path: tempFilePath }) => {
        const kubeConfigAsYaml = exportKubeConfigToYaml(kubeConfig);

        fs.writeFileSync(tempFilePath, kubeConfigAsYaml);

        // Create nested directories if they don't exist. If we don't do this,
        // then rename will fail when some folder doesn't exist
        //
        // Source: https://stackoverflow.com/a/26815894
        const dirPath = path.dirname(filePath);
        fs.existsSync(dirPath) || fs.mkdirSync(dirPath, { recursive: true });

        fs.renameSync(tempFilePath, filePath);
    });
}

/**
 * Filter user's kubeconfig for stale BastionZero-managed entries, remove them,
 * and write filtered config back to disk. See filterKubeConfig() for more
 * details on filtering logic.
 * @param configService Config service
 * @param logger Logger
 */
export async function filterAndOverwriteUserKubeConfig(configService: IFilterKubeConfigService, logger: ILogger): Promise<void> {
    const userKubeConfig = await loadUserKubeConfig();

    const kubeDaemonManagementService = newKubeDaemonManagementService(configService);
    const filterResult = await filterKubeConfig(configService, kubeDaemonManagementService, userKubeConfig.kubeConfig);

    // Only overwrite if there is a change
    if (filterResult.isDirty) {
        await writeKubeConfigTo(filterResult.filteredKubeConfig, userKubeConfig.filePath);

        logger.debug('Modified user\'s kube config!');
        logger.debug(`Removed ${filterResult.removedKubeClusters.length} stale bzero cluster entries and ${filterResult.removedKubeContexts.length} stale bzero context entries from ${userKubeConfig.filePath}`);
        logger.debug(`Removed the following stale bzero cluster entries from ${userKubeConfig.filePath}: ${filterResult.removedKubeClusters.join(',')}`);
        logger.debug(`Removed the following stale bzero context entries from ${userKubeConfig.filePath}: ${filterResult.removedKubeContexts.join(',')}`);
    }
}

/**
 * Merge two Kubernetes configurations into a single configuration. The supplied
 * configurations are not mutated. The destination config takes precedence when
 * resolving a conflict. The merged kube config's currentContext is equal to the
 * destination config's currentContext if it is set; otherwise, the source
 * config's currentContext is used.
 * @param srcConfig Source config. Entries in this config have lower precedence
 * than destConfig's entries in the merged config.
 * @param destConfig Destination config. If an entry in this config has the same
 * name as an entry in the source config, then this config's entry takes
 * precedence and overwrites the source config's entry in the merged config.
 * @returns Merged kube configuration
 */
export function mergeKubeConfig(srcConfig: k8s.KubeConfig, destConfig: k8s.KubeConfig): k8s.KubeConfig {
    const mergedKubeConfig = new KubeConfig();

    // Create mapping of destConfig's clusters, users, and contexts
    const destClustersMap = buildMapOfNamedKubeEntries(destConfig.clusters);
    const destUsersMap = buildMapOfNamedKubeEntries(destConfig.users);
    const destContextsMap = buildMapOfNamedKubeEntries(destConfig.contexts);

    const mergeEntriesWith = <T extends NamedKubeEntry>(srcEntries: T[], destEntriesMap: Map<string, T>): T[] => {
        const mergedEntries: T[] = [];
        for (const entry of srcEntries) {
            const foundTheirEntry = destEntriesMap.get(entry.name);

            if (!foundTheirEntry) {
                mergedEntries.push(entry);
            }
        }

        // Add all entries in destEntriesMap. This should be the entries that
        // were not found in srcEntries.
        mergedEntries.push(...Array.from(destEntriesMap.values()));

        return mergedEntries;
    };

    // Merge clusters, users, and contexts of srcConfig with destConfig
    mergedKubeConfig.clusters = mergeEntriesWith(srcConfig.clusters, destClustersMap);
    mergedKubeConfig.users = mergeEntriesWith(srcConfig.users, destUsersMap);
    mergedKubeConfig.contexts = mergeEntriesWith(srcConfig.contexts, destContextsMap);
    if (destConfig.currentContext) {
        // Accept destConfig's currentContext as the truth if it is set
        mergedKubeConfig.setCurrentContext(destConfig.currentContext);
    } else {
        // Otherwise, keep srcConfig's currentContext
        mergedKubeConfig.setCurrentContext(srcConfig.currentContext);
    }

    return mergedKubeConfig;
}

/**
 * Build a mapping of named kube entries keyed by the entry's name
 * @param arr Array of named kube entries
 * @returns Mapping of named kube entries
 */
export function buildMapOfNamedKubeEntries<T extends NamedKubeEntry>(arr: T[]): Map<string, T> {
    const map = new Map<string, T>();
    arr.forEach(e => map.set(e.name, e));
    return map;
}

/**
 * Determines whether a kubeconfig context is a BastionZero-managed context
 * @param configService Config service
 * @param context Kubeconfig context to check
 * @returns True if the context is managed by BastionZero. Otherwise, returns
 * false.
 */
export function isKubeContextBastionZero(
    configService: IKubeConfigService,
    context: k8s.Context
): boolean {
    const bzeroUsername = getKubeConfigUsername(configService);
    return context.user === bzeroUsername;
}

export interface IFilterKubeConfigService extends IKubeConfigService, KubeDaemonStore { }
export interface IFilterKubeDaemonManagementService extends IDaemonStatusRetriever<ZliKubeConfig> {
    getDaemonConfigs(): Map<string, ZliKubeConfig>;
}

/**
 * Filter kube config for stale BastionZero-managed context and cluster entries.
 * If there are no more running daemons, then the BastionZero-managed user entry
 * is removed in the returned, filtered kube config. The supplied kube config is
 * not mutated.
 *
 * A context/cluster entry is considered stale if the following conditions are
 * met:
 *
 * (1) The context is determined to be managed by BastionZero, i.e. the context
 * references a user entry matching the BastionZero-managed kubeconfig username
 *
 * (2) The context's referenced cluster entry exists in the kubeconfig and is
 * configured with a server whose port does not match any of the kube daemon
 * configs stored in the user's zli config.
 *
 * @param configService Config service
 * @param kubeConfig Kube config to filter
 * @returns Composite result type including the filtered kube config and the
 * entries determined to be stale.
 */
export async function filterKubeConfig(
    configService: IKubeConfigService,
    kubeDaemonManagementService: IFilterKubeDaemonManagementService,
    kubeConfig: k8s.KubeConfig,
): Promise<FilterKubeConfigResult> {
    const kubeDaemonConfigs = kubeDaemonManagementService.getDaemonConfigs();

    // Ports of stored kube daemons in config
    const arrPorts: string[] = [];
    Array.from(kubeDaemonConfigs.values()).forEach(c => {
        // Handle case where localPort is not set (should typically not be the
        // case unless user has modified their config)
        if (c.localPort) {
            arrPorts.push(c.localPort.toString());
        }
    });
    const expectedDaemonPorts = new Set(arrPorts);

    // Build in-memory map of contexts and clusters for fast lookup
    const kubeConfigContexts = buildMapOfNamedKubeEntries(kubeConfig.contexts);
    const kubeConfigClusters = buildMapOfNamedKubeEntries(kubeConfig.clusters);
    const kubeConfigUsers = buildMapOfNamedKubeEntries(kubeConfig.users);

    const staleKubeContextNames = new Set<string>();
    const staleKubeClusterNames = new Set<string>();

    // Iterate through all user's contexts, and remove entries from cluster and
    // context maps if the entry is a stale BastionZero entry
    for (const [contextName, context] of kubeConfigContexts) {
        if (isKubeContextBastionZero(configService, context)) {
            const refCluster = kubeConfigClusters.get(context.cluster);
            if (refCluster) {
                if (!expectedDaemonPorts.has(getPortFromClusterServer(refCluster))) {
                    // The entry is considered stale because it passes the
                    // following checks:
                    // 1) References the BastionZero designated Kube username
                    // 2) Port of server does not match any kube daemon in our
                    //    config

                    // Record staleness. Don't delete from map until end because
                    // there could be duplicate BastionZero context entries that
                    // map to the same cluster entry. This ensures we capture
                    // both stale contexts.
                    staleKubeContextNames.add(contextName);
                    staleKubeClusterNames.add(refCluster.name);
                }
            }
        }
    }

    // Remove from both maps the stale entries
    staleKubeContextNames.forEach(staleContext => kubeConfigContexts.delete(staleContext));
    staleKubeClusterNames.forEach(staleCluster => kubeConfigClusters.delete(staleCluster));

    // Clone because filterKubeConfig() is non-destructive
    const clonedKubeConfig = cloneDeep(kubeConfig);
    // Set contexts and clusters entries to the filtered values to remove the
    // stale entries
    clonedKubeConfig.contexts = Array.from(kubeConfigContexts.values());
    clonedKubeConfig.clusters = Array.from(kubeConfigClusters.values());

    // If we couldn't find at least one running kube daemon, then remove the
    // BastionZero-managed user entry
    let removedBastionZeroManagedUser = false;
    if (!(await findRunningDaemonWithPredicate(kubeDaemonManagementService, (_ => true)))) {
        const managedUsername = getKubeConfigUsername(configService);
        removedBastionZeroManagedUser = kubeConfigUsers.delete(managedUsername);
        clonedKubeConfig.users = Array.from(kubeConfigUsers.values());
    }

    const removedKubeContexts = Array.from(staleKubeContextNames.values());
    const removedKubeClusters = Array.from(staleKubeClusterNames.values());
    return {
        filteredKubeConfig: clonedKubeConfig,
        removedKubeContexts: removedKubeContexts,
        removedKubeClusters: removedKubeClusters,
        isDirty: removedKubeContexts.length > 0 || removedKubeClusters.length > 0 || removedBastionZeroManagedUser
    };
}

/**
 * Find first matching kube context that is a BastionZero context, and
 * referenced cluster entry's port number matches a zli kube daemon config's
 * stored local port
 * @param configService Config service
 * @param kubeContexts List of kube contexts to search
 * @param kubeConfigClusters Mapping of clusters that the list of kube contexts
 * might refer to
 * @param kubeDaemonConfig The kube daemon config to match
 * @returns First matching kube context. Otherwise, returns undefined.
 */
export function findMatchingKubeContext(
    configService: ConfigService,
    kubeContexts: k8s.Context[],
    kubeConfigClusters: Map<string, k8s.Cluster>,
    kubeDaemonConfig: ZliKubeConfig
): k8s.Context {
    return kubeContexts.find(context => {
        if (isKubeContextBastionZero(configService, context)) {
            const refCluster = kubeConfigClusters.get(context.cluster);
            if (refCluster) {
                return getPortFromClusterServer(refCluster) === kubeDaemonConfig.localPort.toString();
            }
        }

        // Some check failed, so return false
        return false;
    });
}

export function getPortFromClusterServer(cluster: k8s.Cluster): string {
    // Must create this wrapper on URL because empty string is returned if
    // default port for protocol is used.
    // Source: https://developer.mozilla.org/en-US/docs/Web/API/URL/port
    const server = new URL(cluster.server);

    if (server.protocol === 'http:' && server.port === '') {
        return '80';
    } else if (server.protocol === 'https:' && server.port === '') {
        return '443';
    } else {
        return server.port;
    }
}