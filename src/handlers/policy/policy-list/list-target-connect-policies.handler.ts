import { Logger } from '../../../services/logger/logger.service';
import { policyArgs } from './policy-list.command-builder';
import { getTableOfTargetConnectPolicies } from '../../../utils/utils';
import { ConfigService } from '../../../services/config/config.service';
import { ApiKeyHttpService } from '../../../http-services/api-key/api-key.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { SsmTargetHttpService } from '../../../http-services/targets/ssm/ssm-target.http-services';
import { DynamicAccessConfigHttpService } from '../../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { BzeroTargetHttpService } from '../../../http-services/targets/bzero/bzero.http-services';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { UserSummary } from '../../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { ApiKeySummary } from '../../../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { GroupSummary } from '../../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetSummary } from '../../../../webshell-common-ts/http/v2/target/targetSummary.types';
import { BzeroAgentSummary } from '../../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { EnvironmentSummary } from '../../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { TargetConnectPolicySummary } from '../../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';

import yargs from 'yargs';


export async function listTargetConnectPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const apiKeyHttpService = new ApiKeyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
    const bzeroTargetHttpService = new BzeroTargetHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);

    let ssmTargets = null;
    let dynamicAccessConfigs = null;
    let bzeroTargets = null;
    let environments = null;
    let targetConnectPolicies = null;

    // Create promise to retrieve ssm targets
    const getSsmTargets = new Promise<TargetSummary[]>( async (res) => {
        const response = await ssmTargetHttpService.ListSsmTargets(true);
        const results = response.map<TargetSummary>((ssm, _index, _array) => {
            return {type: TargetType.SsmTarget, agentPublicKey: ssm.agentPublicKey, id: ssm.id, name: ssm.name, environmentId: ssm.environmentId, agentVersion: ssm.agentVersion, status: ssm.status, targetUsers: undefined, region: ssm.region};
        });
        res(results);
    });

    // Create promise to retrieve dynamic access configs
    const getDynamicAccessConfigs = new Promise<TargetSummary[]>( async (res) => {
        const response = await dynamicConfigHttpService.ListDynamicAccessConfigs();
        const results = response.map<TargetSummary>((config, _index, _array) => {
            return {type: TargetType.DynamicAccessConfig, id: config.id, name: config.name, environmentId: config.environmentId, agentVersion: 'N/A', status: config.status, targetUsers: config.allowedTargetUsers.map(tu => tu.userName), region: 'N/A', agentPublicKey: 'N/A'};
        });
        res(results);
    });

    const getBzeroTargets = new Promise<BzeroAgentSummary[]>( async (res) => {
        res(await bzeroTargetHttpService.ListBzeroTargets());
    });

    // Create promise to retrieve environments
    const getEnvironments = new Promise<EnvironmentSummary[]>( async (res) => {
        res(await envHttpService.ListEnvironments());
    });

    // Create promise to retrieve target connect policies
    const getTargetConnectPolicies = new Promise<TargetConnectPolicySummary[]>( async (res) => {
        res(await policyHttpService.ListTargetConnectPolicies());
    });

    // Await on all promises to make requests in parallel
    [ ssmTargets, dynamicAccessConfigs, bzeroTargets, environments, targetConnectPolicies ] = await Promise.all([getSsmTargets, getDynamicAccessConfigs, getBzeroTargets, getEnvironments, getTargetConnectPolicies]);

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

    const targetNameMap : { [id: string]: string } = {};
    (ssmTargets).forEach(ssmTarget => {
        targetNameMap[ssmTarget.id] = ssmTarget.name;
    });
    (dynamicAccessConfigs).forEach(dacs => {
        targetNameMap[dacs.id] = dacs.name;
    });
    (bzeroTargets).forEach(bzeroTarget => {
        targetNameMap[bzeroTarget.id] = bzeroTarget.name;
    });

    if(!! argv.json) {
        // json output
        return JSON.stringify(targetConnectPolicies);
    } else {
        if (targetConnectPolicies.length === 0){
            logger.info('There are no available Target Connect policies');
        } else {
            // return regular table output
            return getTableOfTargetConnectPolicies(targetConnectPolicies, userMap, apiKeyMap, environmentMap, targetNameMap, groupMap);
        }
    }
}