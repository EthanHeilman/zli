import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { OrganizationHttpService } from 'http-services/organization/organization.http-services';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { editPolicy, getPolicyFromName } from 'services/policy/policy.services';

export async function deleteGroupFromPolicyHandler(groupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the group
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.ListGroups();
    const groupSummary = groups.find(g => g.name == groupName);
    if (groupSummary == undefined) {
        throw new Error(`Unable to find group with name: ${groupName}`);
    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (policy === null) {
        // Log an error
        throw new Error(`Unable to find policy with name: ${policyName}`);
    }

    // If this group does not exist in this policy
    if (!policy.groups.find(g => g.name == groupSummary.name)) {
        throw new Error(`Group ${groupName} does not exist for policy: ${policyName}`);
    }

    // Then delete the group from the policy
    policy.groups = policy.groups.filter(g => g.name !== groupSummary.name);

    // And finally update the policy
    await editPolicy(policy, policyHttpService);

    logger.info(`Deleted ${groupName} from ${policyName} policy!`);
}
