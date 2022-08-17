import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { editPolicy, getPolicyFromName } from '../../../../src/services/policy/policy.services';

export async function deleteGroupFromPolicyHandler(groupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the group
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.ListGroups();
    const groupSummary = groups.find(g => g.name == groupName);
    if (groupSummary == undefined) {
        logger.error(`Unable to find group with name: ${groupName}`);
        await cleanExit(1, logger);
    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policy = await getPolicyFromName(policyName, policyHttpService);

    if (policy === null) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    // If this group does not exist in this policy
    if (!policy.groups.find(g => g.name == groupSummary.name)) {
        logger.error(`Group ${groupName} does not exist for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then delete the group from the policy
    policy.groups = policy.groups.filter(g => g.name !== groupSummary.name);

    // And finally update the policy
    await editPolicy(policy, policyHttpService);

    logger.info(`Deleted ${groupName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}
