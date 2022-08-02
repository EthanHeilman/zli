import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from './policy-list.command-builder';
import { ApiKeyHttpService } from '../../../http-services/api-key/api-key.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { getTableOfProxyPolicies } from '../../../utils/utils';
import { UserSummary } from '../../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { ApiKeySummary } from '../../../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { GroupSummary } from '../../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { EnvironmentSummary } from '../../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { ProxyPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { DbTargetService } from '../../../http-services/db-target/db-target.http-service';
import { WebTargetService } from '../../../http-services/web-target/web-target.http-service';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';

export async function listProxyPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const apiKeyHttpService = new ApiKeyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);

    let environments = null;
    let proxyPolicies = null;

    // Create promise to retrieve environments
    const getEnvironments = new Promise<EnvironmentSummary[]>( async (res) => {
        res(await envHttpService.ListEnvironments());
    });

    // Create promise to retrieve proxy policies
    const getproxyPolicies = new Promise<ProxyPolicySummary[]>( async (res) => {
        res(await policyHttpService.ListProxyPolicies());
    });

    // Await on all promises to make requests in parallel
    [ environments, proxyPolicies ] = await Promise.all([getEnvironments, getproxyPolicies]);

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

    const environmentMap : { [id: string]: EnvironmentSummary } = {};
    (environments).forEach(environmentSummaries => {
        environmentMap[environmentSummaries.id] = environmentSummaries;
    });

    // List our dbTargets
    const dbTargetService = new DbTargetService(configService, logger);
    const dbTargets = await dbTargetService.ListDbTargets();

    // List our web targets
    const webTargetService = new WebTargetService(configService, logger);
    const webTargets = await webTargetService.ListWebTargets();

    // Create our targetNameMap
    const targetNameMap : { [id: string]: string } = {};
    dbTargets.forEach(dbTarget => {
        targetNameMap[dbTarget.id] = dbTarget.name;
    });
    webTargets.forEach(webTarget => {
        targetNameMap[webTarget.id] = webTarget.name;
    });

    if(!! argv.json) {
        // json output
        return JSON.stringify(proxyPolicies);
    } else {
        if (proxyPolicies.length === 0){
            logger.info('There are no available Proxy policies');
        } else {
            // regular table output
            return getTableOfProxyPolicies(proxyPolicies, userMap, environmentMap, targetNameMap, apiKeyMap, groupMap);
        }
    }
}