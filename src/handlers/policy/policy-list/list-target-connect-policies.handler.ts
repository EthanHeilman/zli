import yargs from 'yargs';
import { Logger } from 'services/logger/logger.service';
import { policyArgs } from 'handlers/policy/policy-list/policy-list.command-builder';
import { getTableOfTargetConnectPolicies } from 'utils/utils';
import { ConfigService } from 'services/config/config.service';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { SsmTargetHttpService } from 'http-services/targets/ssm/ssm-target.http-services';
import { DynamicAccessConfigHttpService } from 'http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { EnvironmentSummary } from 'webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { getPolicySubjectDisplayInfo } from 'services/policy/policy.services';


export async function listTargetConnectPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
    const bzeroTargetHttpService = new BzeroTargetHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);

    // Await on all promises to make requests in parallel
    const [ ssmTargets, dynamicAccessConfigs, bzeroTargets, environments, targetConnectPolicies, policySubjectDisplayInfo] = await Promise.all([
        ssmTargetHttpService.ListSsmTargets(true),
        dynamicConfigHttpService.ListDynamicAccessConfigs(),
        bzeroTargetHttpService.ListBzeroTargets(),
        envHttpService.ListEnvironments(),
        policyHttpService.ListTargetConnectPolicies(),
        getPolicySubjectDisplayInfo(configService, logger)
    ]);

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
            return getTableOfTargetConnectPolicies(targetConnectPolicies, policySubjectDisplayInfo.userMap, environmentMap, targetNameMap, policySubjectDisplayInfo.groupMap, policySubjectDisplayInfo.serviceAccountMap);
        }
    }
}