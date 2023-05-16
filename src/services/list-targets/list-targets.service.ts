import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary, bzeroTargetToTargetSummary, dbTargetToTargetSummary } from 'utils/utils';
import { TargetSummary } from 'webshell-common-ts/http/v2/target/targetSummary.types';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { WebTargetHttpService } from 'http-services/web-target/web-target.http-service';
import { DynamicAccessConfigHttpService } from 'http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { KubeHttpService } from 'http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from 'http-services/targets/ssm/ssm-target.http-services';
import { DbTargetHttpService } from 'http-services/db-target/db-target.http-service';
import { PolicyQueryHttpService } from 'http-services/policy-query/policy-query.http-services';
import { Dictionary } from 'lodash';
import { gte, parse, SemVer } from 'semver';
import { AgentType } from 'webshell-common-ts/http/v2/target/types/agent.types';

export async function listTargets(
    configService: ConfigService,
    logger: Logger,
    targetTypes: TargetType[],
    userEmail?: string
) : Promise<TargetSummary[]>
{
    const targetsPerType: Dictionary<TargetSummary[]> = await listTargetsPerType(configService, logger, targetTypes, userEmail);
    const allTargetSummaries: TargetSummary[][] = [[]];
    for (const targets in targetsPerType) {
        allTargetSummaries.push(targetsPerType[targets]);
    }
    const allTargetSummariesFlattened = allTargetSummaries.reduce((t1, t2) => t1.concat(t2), []);

    return allTargetSummariesFlattened;
}

/**
 * Lists all the targets of the specified {@link targetTypes} and creates a dictionary {@link TargetType} -> [{@link TargetSummary}].
 * @returns a dictionary {@link TargetType} -> [{@link TargetSummary}].
 */
export async function listTargetsPerType(
    configService: ConfigService,
    logger: Logger,
    targetTypes: TargetType[],
    userEmail?: string
) : Promise<Dictionary<TargetSummary[]>>
{
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    let targetSummaryWork: Promise<TargetSummary[]>[] = [];

    if (targetTypes.includes(TargetType.SsmTarget)) {
        const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
        const getSsmTargetSummaries = async () => {
            let ssmTargetSummaries = await ssmTargetHttpService.ListSsmTargets(true);

            if(userEmail) {
                // Filter ssm targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.TargetConnectPolicyQuery(ssmTargetSummaries.map(t => t.id), TargetType.SsmTarget, userEmail);
                ssmTargetSummaries = ssmTargetSummaries.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed target users/verbs
                ssmTargetSummaries.forEach(t => {
                    t.allowedTargetUsers = policyQueryResponse[t.id].allowedTargetUsers;
                    t.allowedVerbs = policyQueryResponse[t.id].allowedVerbs;
                });
            }

            return ssmTargetSummaries.map(ssmTargetToTargetSummary);
        };

        targetSummaryWork = targetSummaryWork.concat(getSsmTargetSummaries());
    }

    if (targetTypes.includes(TargetType.DynamicAccessConfig)) {
        const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
        const getDynamicAccessConfigSummaries = async () => {
            let dynamicAccessConfigSummaries = await dynamicConfigHttpService.ListDynamicAccessConfigs();
            if (userEmail) {
                // Filter dac targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.TargetConnectPolicyQuery(dynamicAccessConfigSummaries.map(t => t.id), TargetType.DynamicAccessConfig, userEmail);
                dynamicAccessConfigSummaries = dynamicAccessConfigSummaries.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed target users/verbs
                dynamicAccessConfigSummaries.forEach(t => {
                    t.allowedTargetUsers = policyQueryResponse[t.id].allowedTargetUsers;
                    t.allowedVerbs = policyQueryResponse[t.id].allowedVerbs;
                });
            }

            return dynamicAccessConfigSummaries.map(dynamicConfigToTargetSummary);
        };

        targetSummaryWork = targetSummaryWork.concat(getDynamicAccessConfigSummaries());
    }

    if (targetTypes.includes(TargetType.Linux) || targetTypes.includes(TargetType.Windows)) {
        const bzeroTargetService = new BzeroTargetHttpService(configService, logger);
        const getBzeroAgentTargetSummaries = async () => {
            let bzeroAgents = await bzeroTargetService.ListBzeroTargets();
            
            if (!targetTypes.includes(TargetType.Windows)) {
                bzeroAgents = bzeroAgents.filter(t => t.agentType === AgentType.Linux);
            } else if (!targetTypes.includes(TargetType.Linux)) {
                bzeroAgents = bzeroAgents.filter(t => t.agentType === AgentType.Windows);
            }

            if (userEmail) {
                // Filter bzero targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.TargetConnectPolicyQuery(bzeroAgents.map(t => t.id), TargetType.Linux, userEmail);
                bzeroAgents = bzeroAgents.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed target users/verbs
                bzeroAgents.forEach(t => {
                    // TODO: when we have an RDP verb in the backend, should filter these between linux/windows
                    t.allowedVerbs = policyQueryResponse[t.id].allowedVerbs;
                    if (t.agentType === AgentType.Linux) {
                        t.allowedTargetUsers = policyQueryResponse[t.id].allowedTargetUsers;
                    }
                });
            }

            return bzeroAgents.map<TargetSummary>(bzeroTargetToTargetSummary);
        };

        targetSummaryWork = targetSummaryWork.concat(getBzeroAgentTargetSummaries());
    }

    if (targetTypes.includes(TargetType.Cluster)) {
        const kubeHttpService = new KubeHttpService(configService, logger);
        const getKubeClusterSummaries = async () => {
            let kubeClusterSummaries = await kubeHttpService.ListKubeClusters();
            if (userEmail) {
                // Filter cluster targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.KubePolicyQuery(kubeClusterSummaries.map(t => t.id), userEmail);
                kubeClusterSummaries = kubeClusterSummaries.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed cluster users/groups
                kubeClusterSummaries.forEach(cluster => {
                    cluster.allowedClusterUsers = policyQueryResponse[cluster.id].allowedClusterUsers;
                    cluster.allowedClusterGroups = policyQueryResponse[cluster.id].allowedClusterGroups;
                });
            }

            return kubeClusterSummaries.map<TargetSummary>((cluster) => {
                return {
                    type: TargetType.Cluster,
                    agentPublicKey: cluster.agentPublicKey,
                    id: cluster.id,
                    name: cluster.name,
                    status: parseTargetStatus(cluster.status.toString()),
                    environmentId: cluster.environmentId,
                    targetUsers: cluster.allowedClusterUsers,
                    agentVersion: cluster.agentVersion,
                    region: cluster.region
                };
            });
        };

        targetSummaryWork = targetSummaryWork.concat(getKubeClusterSummaries());
    }

    if (targetTypes.includes(TargetType.Db)) {
        const dbTargetService = new DbTargetHttpService(configService, logger);
        const getDbTargetSummaries = async () => {
            let dbTargetSummaries = await dbTargetService.ListDbTargets();
            if (userEmail) {
                // Filter db targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.ProxyPolicyQuery(dbTargetSummaries.map(t => t.id), TargetType.Db, userEmail);
                dbTargetSummaries = dbTargetSummaries.filter(t => policyQueryResponse[t.id].allowed);
                // Update set of allowed target users
                dbTargetSummaries.forEach(t => {
                    t.allowedTargetUsers = t.splitCert ? policyQueryResponse[t.id].allowedTargetUsers : null;
                });
            }

            return dbTargetSummaries.map<TargetSummary>(dbTargetToTargetSummary);
        };

        targetSummaryWork = targetSummaryWork.concat(getDbTargetSummaries());
    }

    if (targetTypes.includes(TargetType.Web)) {
        const webTargetService = new WebTargetHttpService(configService, logger);
        const getWebTargetSummaries = async () => {
            let webTargetSummaries = await webTargetService.ListWebTargets();
            if (userEmail) {
                // Filter web targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.ProxyPolicyQuery(webTargetSummaries.map(t => t.id), TargetType.Web, userEmail);
                webTargetSummaries = webTargetSummaries.filter(t => policyQueryResponse[t.id].allowed);
            }

            return webTargetSummaries.map<TargetSummary>((webTarget) => {
                return {
                    type: TargetType.Web,
                    agentPublicKey: webTarget.agentPublicKey,
                    id: webTarget.id,
                    name: webTarget.name,
                    status: parseTargetStatus(webTarget.status.toString()),
                    environmentId: webTarget.environmentId,
                    targetUsers: [],
                    agentVersion: webTarget.agentVersion,
                    region: webTarget.region
                };
            });
        };

        targetSummaryWork = targetSummaryWork.concat(getWebTargetSummaries());
    }

    const allTargetSummaries = await Promise.all(targetSummaryWork);

    const targetsPerType: Dictionary<TargetSummary[]> = {};
    allTargetSummaries.forEach(targets => {
        if(targets.length) {
            targetsPerType[targets[0].type] = targets;
        }
    });
    return targetsPerType;
}

/**
 * Returns all the targets that are equal or above the specified {@link minAgentVersion}.
 * Includes targets with undefined version.
 * @returns a list of {@link TargetSummary} are equal or above the specified version.
 */
export function filterTargetsOnVersion(
    targets: TargetSummary[],
    minAgentVersion: SemVer = new SemVer('0.0.0')
) : TargetSummary[]
{
    return targets
        .filter(
            t => {
                const sanitizedAgentVersion = t.agentVersion.replace('-beta', '');
                const agentVersion = parse(sanitizedAgentVersion);
                return (agentVersion == null) || gte(agentVersion, minAgentVersion);
            }
        );
}