import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { GroupSummary } from '../../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { Group } from '../../../../webshell-common-ts/http/v2/policy/types/group.types';
import { editPolicy, getPolicyFromName } from '../../../services/policy/policy.services';

export async function addGroupToPolicyHandler(groupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the group
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.ListGroups();
    let groupSummary : GroupSummary = undefined;
    for (const group of groups){
        if (group.name == groupName)
            groupSummary = group;
    }
    if (groupSummary == undefined) {
        throw new Error(`Unable to find group with name: ${groupName}`);
    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (policy === null) {
        // Log an error
        throw new Error(`Unable to find policy with name: ${policyName}`);
    }

    // If this group exists already
    const group = policy.groups.find((g: Group) => g.name == groupSummary.name);
    if (group) {
        throw new Error(`Group ${groupSummary.name} exists already for policy: ${policyName}`);
    }

    // Then add the group to the policy
    const groupToAdd: Group = {
        id: groupSummary.idPGroupId,
        name: groupSummary.name
    };
    policy.groups.push(groupToAdd);

    // And finally update the policy
    await editPolicy(policy, policyHttpService);

    logger.info(`Added ${groupName} to ${policyName} policy!`);
}
