import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from './policy-list.command-builder';
import { ApiKeyHttpService } from '../../../http-services/api-key/api-key.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { getTableOfSessionRecordingPolicies } from '../../../utils/utils';
import { ApiKeySummary } from '../../../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { UserSummary } from '../../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { GroupSummary } from '../../../../webshell-common-ts/http/v2/organization/types/group-summary.types';

export async function listSessionRecordingPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const apiKeyHttpService = new ApiKeyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);

    const sessionRecordingPolicies = await policyHttpService.ListSessionRecordingPolicies();

    // Fetch all the users, apiKeys, environments and targets
    // We will use that info to print the policies in a readable way
    const users = await userHttpService.ListUsers();
    const userMap : { [id: string]: UserSummary } = {};
    users.forEach(userSummary => {
        userMap[userSummary.id] = userSummary;
    });

    const apiKeys = await apiKeyHttpService.ListAllApiKeys();
    const apiKeyMap : { [id: string]: ApiKeySummary } = {};
    apiKeys.forEach(apiKeyDetails => {
        apiKeyMap[apiKeyDetails.id] = apiKeyDetails;
    });

    const groupMap : { [id: string]: GroupSummary } = {};
    const groups = await organizationHttpService.ListGroups();
    if (!!groups)
        groups.forEach(groupSummary => {
            groupMap[groupSummary.idPGroupId] = groupSummary;
        });

    if(!! argv.json) {
        // json output
        return JSON.stringify(sessionRecordingPolicies);
    } else {
        if (sessionRecordingPolicies.length === 0){
            logger.info('There are no available Session Recording policies');
        } else {
            // regular table output
            return getTableOfSessionRecordingPolicies(sessionRecordingPolicies, userMap, apiKeyMap, groupMap);
        }
    }
}