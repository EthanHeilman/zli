import { Logger } from '../services/logger/logger.service';
import { cleanExit } from '../../src/handlers/clean-exit.handler';
import { isGuid } from '../utils/utils';
import { UserHttpService } from '../../src/http-services/user/user.http-services';
import { OrganizationHttpService } from '../../src/http-services/organization/organization.http-services';
import { EnvironmentHttpService } from '../../src/http-services/environment/environment.http-services';
import { BzeroTargetHttpService } from '../../src/http-services/targets/bzero/bzero.http-services';
import { DynamicAccessConfigHttpService } from '../../src/http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { KubeHttpService } from '../../src/http-services/targets/kube/kube.http-services';
import { WebTargetService } from '../../src/http-services/web-target/web-target.http-service';
import { DbTargetService } from '../../src/http-services/db-target/db-target.http-service';
import { Target } from '../../webshell-common-ts/http/v2/policy/types/target.types';
import { Cluster } from '../../webshell-common-ts/http/v2/policy/types/cluster.types';
import { SubjectType } from '../../webshell-common-ts/http/v2/common.types/subject.types';
import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';
import { EnvironmentSummary } from '../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { GroupSummary } from '../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { UserSummary } from '../../webshell-common-ts/http/v2/user/types/user-summary.types';

export async function getUsersByEmail(emails: string[], userHttpService: UserHttpService, logger: Logger) {
    // For each user, if they exist, grab the UserSummary and create a new Subject object
    // id = UserSummary.id, type = SubjectType.User
    const allUsers = await userHttpService.ListUsers();
    const summaries = await parseUniqueResource(emails, allUsers, 'user', (u: UserSummary) => u.email, logger);
    const users = summaries.map((summary: UserSummary) => {
        return {
            id: summary.id,
            type: SubjectType.User
        };
    });
    return users;
}

export async function getGroupsByName(groupNames: string[], organizationHttpService: OrganizationHttpService, logger: Logger) {
    // For each group, if it exists, grab the GroupSummary and create a new Group object
    // id = GroupSummary.idPGroupId, name = GroupSummary.name
    const allGroups = await organizationHttpService.ListGroups();
    const summaries = await parseUniqueResource(groupNames, allGroups, 'group', (g: GroupSummary) => g.name, logger);
    const groups = summaries.map((summary: GroupSummary) => {
        return {
            id: summary.idPGroupId,
            name: summary.name
        };
    });
    return groups;
}

export async function getEnvironmentByName(environmentNames: string[], envHttpService: EnvironmentHttpService, logger: Logger) {
    // For each environment, if it exists, grab the EnvironmentSummary and create a new Environment object
    // id = EnvironmentSummary.id
    const allEnvironments = await envHttpService.ListEnvironments();
    const summaries = await parseUniqueResource(environmentNames, allEnvironments, 'environment', (e: EnvironmentSummary) => e.name, logger);
    const evironments = summaries.map((summary: EnvironmentSummary) => {
        return {
            id: summary.id,
        };
    });
    return evironments;
}

async function parseUniqueResource<T>(resourceNames: string[], allResources: T[], type: string, toResourceKey: (res: T) => string, logger: Logger): Promise<T[]> {
    // For parsing resources with unique names
    const resources: T[] = [];
    const allResourcesMap: {[name: string] : T} = {};
    allResources.forEach((summary: T) => {
        allResourcesMap[toResourceKey(summary)] = summary;
    });

    for(const resourceName of resourceNames){
        if(!allResourcesMap[resourceName]) {
            logger.error(`Unable to find ${type} with name: ${resourceName}`);
            await cleanExit(1, logger);
        } else {
            resources.push(allResourcesMap[resourceName]);
        }
    }
    return resources;
}

export async function getClustersByNameOrId(clusterNames: string[], kubeHttpService: KubeHttpService, logger: Logger) {
    const allClusters = await kubeHttpService.ListKubeClusters();
    // We need a map for name and id to be able to search on both
    const allClusterNamesMap: {[name:string]: [Cluster]} = {};
    const allClusterIdsMap: {[id:string]: Cluster} = {};
    allClusters.forEach(c => {
        if(!allClusterNamesMap[c.name]) {
            allClusterNamesMap[c.name] = [{ id: c.id }];
        } else {
            allClusterNamesMap[c.name].push({ id: c.id });
        }
        allClusterIdsMap[c.id] = { id: c.id };
    });
    return await parseClustersByNameOrId(clusterNames, allClusterNamesMap, allClusterIdsMap,logger);
}

async function parseClustersByNameOrId<T extends Cluster>(
    clusterNames: string[],
    allClusterNamesMap: {[name:string]: [T]},
    allClusterIdsMap: {[id:string]: T},
    logger: Logger): Promise<T[]> {
    const clusters: T[] = [];
    for(const clusterNameOrId of clusterNames) {
        if(!allClusterNamesMap[clusterNameOrId] && !allClusterIdsMap[clusterNameOrId]){
            logger.error(`Unable to find cluster with name/id: ${clusterNameOrId}`);
            await cleanExit(1, logger);
        } else if(allClusterNamesMap[clusterNameOrId]) {
            if(allClusterNamesMap[clusterNameOrId].length > 1) {
                logger.error(`Multiple clusters with name: ${clusterNameOrId}`);
                await cleanExit(1, logger);
            } else {
                // Each pair's value is an array that can have multiple values
                allClusterNamesMap[clusterNameOrId].forEach((t:T) => {
                    clusters.push(t);
                });
            }
        } else if(allClusterIdsMap[clusterNameOrId]){
            clusters.push(allClusterIdsMap[clusterNameOrId]);
        }
    }
    return clusters;
}

export async function getVirtualTargetsByNameOrId(targetNames: string[], dbTargetService: DbTargetService, webTargetService: WebTargetService, logger: Logger) {
    const [allDbTargets, allWebTargets] = await Promise.all([dbTargetService.ListDbTargets(), webTargetService.ListWebTargets()]);
    // We need a map for name and id to be able to search on both
    const allDbNamesMap: {[name:string]: [Target]} = {};
    const allDbIdsMap: {[id:string]: Target} = {};
    allDbTargets.forEach(t => {
        if(!allDbNamesMap[t.name]) {
            allDbNamesMap[t.name] = [{ id: t.id, type: TargetType.Db }];
        } else {
            allDbNamesMap[t.name].push({ id: t.id, type: TargetType.Db });
        }
        allDbIdsMap[t.id] = { id: t.id, type: TargetType.Db };
    });

    const allWebNamesMap: {[name:string]: [Target]} = {};
    const allWebIdsMap: {[id:string]: Target} = {};
    allWebTargets.forEach(t => {
        if(!allWebNamesMap[t.name]) {
            allWebNamesMap[t.name] = [{ id: t.id, type: TargetType.Web }];
        } else {
            allWebNamesMap[t.name].push({ id: t.id, type: TargetType.Web });
        }
        allWebIdsMap[t.id] = { id: t.id, type: TargetType.Web };
    });
    const errorTargetType = 'virtual target';
    return await parseMultipleTargetTypes(targetNames, allDbNamesMap, allDbIdsMap, allWebNamesMap, allWebIdsMap, errorTargetType, logger);
}

export async function getBaseDacTargetsByNameOrId(targetNames: string[], baseTargetHttpService: BzeroTargetHttpService, dynamicAccessHttpService: DynamicAccessConfigHttpService, logger: Logger) {
    const [allBaseTargets, allDynamicTargets] = await Promise.all([baseTargetHttpService.ListBzeroTargets(), dynamicAccessHttpService.ListDynamicAccessConfigs()]);
    // We need a map for name and id to be able to search on both
    const allBzeroNamesMap: {[name:string]: [Target]} = {};
    const allBzeroIdsMap: {[id:string]: Target} = {};
    allBaseTargets.forEach(t => {
        if(!allBzeroNamesMap[t.name]) {
            allBzeroNamesMap[t.name] = [{ id: t.id, type: TargetType.Bzero }];
        } else {
            allBzeroNamesMap[t.name].push({ id: t.id, type: TargetType.Bzero });
        }
        allBzeroIdsMap[t.id] = { id: t.id, type: TargetType.Bzero };
    });

    const allDynamicNamesMap: {[name:string]: [Target]} = {};
    const allDynamicIdsMap: {[id:string]: Target} = {};
    allDynamicTargets.forEach(t => {
        if(!allDynamicNamesMap[t.name]) {
            allDynamicNamesMap[t.name] = [{ id: t.id, type: TargetType.DynamicAccessConfig }];
        } else {
            allDynamicNamesMap[t.name].push({ id: t.id, type: TargetType.DynamicAccessConfig });
        }
        allDynamicIdsMap[t.id] = { id: t.id, type: TargetType.DynamicAccessConfig };
    });
    const errorTargetType = 'base target or dynamic access config';
    return await parseMultipleTargetTypes(targetNames, allBzeroNamesMap, allBzeroIdsMap, allDynamicNamesMap, allDynamicIdsMap, errorTargetType, logger);
}

async function parseMultipleTargetTypes<T extends Target>(
    targetNames: string[],
    allTargetNamesType1: {[name:string]: [T]},
    allTargetIdsType1: {[id:string]: T},
    allTargetNamesType2: {[name:string]: [T]},
    allTargetIdsType2: {[id:string]: T},
    errorTargetType: string,
    logger: Logger): Promise<T[]> {
    const targets: T[] = [];
    for(const targetNameOrId of targetNames) {
        if(isGuid(targetNameOrId)) {
            if(!allTargetIdsType1[targetNameOrId] && !allTargetIdsType2[targetNameOrId]) {
                logger.error(`Unable to find ${errorTargetType} with id: ${targetNameOrId}`);
                await cleanExit(1, logger);
            } else if(allTargetIdsType1[targetNameOrId]) {
                targets.push(allTargetIdsType1[targetNameOrId]);
            } else {
                targets.push(allTargetIdsType2[targetNameOrId]);
            }
        } else {
            if(!allTargetNamesType1[targetNameOrId] && !allTargetNamesType2[targetNameOrId]) {
                logger.error(`Unable to find ${errorTargetType} with name: ${targetNameOrId}`);
                await cleanExit(1, logger);
            }
            const targetsType1Count = allTargetNamesType1[targetNameOrId] ? allTargetNamesType1[targetNameOrId].length : 0;
            const targetsType2Count = allTargetNamesType2[targetNameOrId] ? allTargetNamesType2[targetNameOrId].length : 0;
            const totalTargetCount = targetsType1Count + targetsType2Count;
            if(totalTargetCount > 1) {
                logger.error(`More than 1 ${errorTargetType} with name: ${targetNameOrId}. Must use target id instead.`);
                await cleanExit(1, logger);
            } else if(targetsType1Count === 1) {
                // Each pair's value is an array that can have multiple values
                allTargetNamesType1[targetNameOrId].forEach((t:T) => {
                    targets.push(t);
                });
            } else {
                allTargetNamesType2[targetNameOrId].forEach((t:T) => {
                    targets.push(t);
                });
            }
        }
    }
    return targets;
}
