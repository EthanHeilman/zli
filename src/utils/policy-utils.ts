import { Logger } from '../services/logger/logger.service';
import { cleanExit } from '../../src/handlers/clean-exit.handler';
import { UserHttpService } from '../../src/http-services/user/user.http-services';
import { OrganizationHttpService } from '../../src/http-services/organization/organization.http-services';
import { EnvironmentHttpService } from '../../src/http-services/environment/environment.http-services';
import { Target } from '../../webshell-common-ts/http/v2/policy/types/target.types';
import { SubjectType } from '../../webshell-common-ts/http/v2/common.types/subject.types';
import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';
import { EnvironmentSummary } from '../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { GroupSummary } from '../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { UserSummary } from '../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { SubjectHttpService } from '../../src/http-services/subject/subject.http-services';
import { SubjectSummary } from '../../webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { SemVer } from 'semver';
import { ConfigService } from '../../src/services/config/config.service';
import { Dictionary } from 'lodash';
import { TargetSummary } from '../../webshell-common-ts/http/v2/target/targetSummary.types';
import { filterTargetsOnVersion, listTargetsPerType } from '../../src/services/list-targets/list-targets.service';

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

export async function getSubjectsByEmail(emails: string[], subjectHttpService: SubjectHttpService, logger: Logger) {
    // For each subject, if they exist, grab the SubjectSummary and create a new policy Subject object
    // id = SubjectSummary.id, type = SubjectType
    const allSubjects = await subjectHttpService.ListSubjects();
    const summaries = await parseUniqueResource(emails, allSubjects, 'subject', (s: SubjectSummary) => s.email, logger);
    const subjects = summaries.map((summary: SubjectSummary) => {
        return {
            id: summary.id,
            type: summary.type
        };
    });
    return subjects;
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

/**
 * Checks that in the all targets dictionary every user provided identifier is mapped to a target.
 * @param targetsIdentifierMap A dictionary of all target identifiers (targetName or targetId) -> target
 * @param targetIdentifiers An array of user specified target names and target ids whose existence will be checked
 */
export async function checkAllIdentifiersExist<T extends Target>(logger: Logger, errorTargetType: string, targetsIdentifierMap: Dictionary<T[]>, targetIdentifiers: string[]) {
    for (const targetIdentifier of targetIdentifiers) {
        if(!targetsIdentifierMap[targetIdentifier]) {
            logger.error(`Unable to find ${errorTargetType} with name/id: ${targetIdentifier}`);
            await cleanExit(1, logger);
        }
    }
}

/**
 * Checks that in the all targets dictionary no user provided identifier is mapped to multiple targets.
 * Expects only identifiers with one or more values, use {@link checkAllIdentifiersExist} before calling this
 * @param targetsIdentifierMap A dictionary of all target identifiers (targetName or targetId) -> target
 * @param targetIdentifiers An array of user specified target names and target ids whose existence will be checked
 */
export async function checkAllIdentifiersAreSingle<T extends Target>(logger: Logger, errorTargetType: string, targetsIdentifierMap: Dictionary<T[]>, targetIdentifiers: string[]) {
    for (const targetIdentifier of targetIdentifiers) {
        if(targetsIdentifierMap[targetIdentifier]?.length > 1) {
            logger.error(`Multiple ${errorTargetType}s with name: ${targetIdentifier}`);
            await cleanExit(1, logger);
        }
    }
}

/**
 * Converts an array of identifiers (names or ids) of targets to a dictionary of targetIdentifier -> [{@link Target}].
 * An identifier can be mapped to [] or [target] or [target1, target2] depending on whether it was not found,
 *  or it was found once, or it was found multiple times.
 * @param targetTypes The array of target types that will be used to filter and return only targets of these types
 * @param minAgentVersion Optional. A SemVar designating the agent version a target needs to be equal or above to be returned. Defaults to 0
 * @returns A dictionary of targetIdentifier -> [{@link Target}].
 * An identifier can be mapped to [] or [target] or [target1, target2]
 * depending on whether it was not found, or it was found once, or it was found multiple times.
 */
export async function getTargetsByNameOrId(
    configService: ConfigService,
    logger: Logger,
    targetTypes: TargetType[],
    minAgentVersion: SemVer = new SemVer('0.0.0')
) : Promise<Dictionary<Target[]>>
{
    const targetsPerType: Dictionary<TargetSummary[]> = await listTargetsPerType(configService, logger, targetTypes, null);

    const allTargets: TargetSummary[] = targetTypes.map(t => targetsPerType[t]).filter(t => t).reduce((acc, current) => [...acc, ...current], []);
    const versionFilteredTargets = filterTargetsOnVersion(allTargets, minAgentVersion);
    const allTargetIdentifiersMap = mapTargetsByNameOrId(versionFilteredTargets);
    return allTargetIdentifiersMap;
}

function mapTargetsByNameOrId(allTargets: TargetSummary[]) : Dictionary<Target[]> {
    const targetsIdentifierMap: Dictionary<Target[]> = {};
    allTargets.forEach(t => {
        if(!targetsIdentifierMap[t.name]) {
            targetsIdentifierMap[t.name] = [{ id: t.id, type: t.type }];
        } else {
            targetsIdentifierMap[t.name].push({ id: t.id, type: t.type });
        }
        targetsIdentifierMap[t.id] = [{ id: t.id, type: t.type }];
    });
    return targetsIdentifierMap;
}