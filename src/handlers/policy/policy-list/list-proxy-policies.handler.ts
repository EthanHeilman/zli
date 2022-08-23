import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from './policy-list.command-builder';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { getTableOfProxyPolicies } from '../../../utils/utils';
import { EnvironmentSummary } from '../../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { DbTargetService } from '../../../http-services/db-target/db-target.http-service';
import { WebTargetService } from '../../../http-services/web-target/web-target.http-service';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { getPolicySubjectDisplayInfo } from '../../../services/policy/policy.services';

export async function listProxyPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);
    const dbTargetService = new DbTargetService(configService, logger);
    const webTargetService = new WebTargetService(configService, logger);

    const [ environments, proxyPolicies, dbTargets, webTargets, policySubjectDisplayInfo] = await Promise.all([
        envHttpService.ListEnvironments(),
        policyHttpService.ListProxyPolicies(),
        dbTargetService.ListDbTargets(),
        webTargetService.ListWebTargets(),
        getPolicySubjectDisplayInfo(configService, logger)
    ]);

    const environmentMap : { [id: string]: EnvironmentSummary } = {};
    (environments).forEach(environmentSummaries => {
        environmentMap[environmentSummaries.id] = environmentSummaries;
    });

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
            return getTableOfProxyPolicies(proxyPolicies, policySubjectDisplayInfo.userMap, environmentMap, targetNameMap, policySubjectDisplayInfo.groupMap);
        }
    }
}