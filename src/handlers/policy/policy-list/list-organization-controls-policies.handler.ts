import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from 'handlers/policy/policy-list/policy-list.command-builder';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { getTableOfOrganizationControlPolicies } from 'utils/utils';
import { getPolicySubjectDisplayInfo } from 'services/policy/policy.services';

export async function listOrganizationControlsPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = new PolicyHttpService(configService, logger);

    const [organizationControlPolicies, policySubjectDisplayInfo] = await Promise.all([
        policyHttpService.ListOrganizationControlPolicies(),
        getPolicySubjectDisplayInfo(configService, logger)
    ]);

    if(!! argv.json) {
        // json output
        return JSON.stringify(organizationControlPolicies);
    } else {
        if (organizationControlPolicies.length === 0){
            logger.info('There are no available Organization Controls policies');
        } else {
            // regular table output
            return getTableOfOrganizationControlPolicies(organizationControlPolicies, policySubjectDisplayInfo.userMap, policySubjectDisplayInfo.groupMap, policySubjectDisplayInfo.serviceAccountMap);
        }
    }
}