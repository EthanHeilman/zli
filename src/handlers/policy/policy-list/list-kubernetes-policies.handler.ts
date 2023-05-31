import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from 'handlers/policy/policy-list/policy-list.command-builder';
import { EnvironmentSummary } from 'webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { getTableOfKubernetesPolicies } from 'utils/utils';
import { KubeHttpService } from 'http-services/targets/kube/kube.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { getPolicySubjectDisplayInfo } from 'services/policy/policy.services';

export async function listKubernetesPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const policyHttpService = await PolicyHttpService.init(configService, logger);
    const kubeHttpService = await KubeHttpService.init(configService, logger);
    const envHttpService = await EnvironmentHttpService.init(configService, logger);

    const [clusterTargets, environments, kubernetesPolicies, policySubjectDisplayInfo] = await Promise.all([
        kubeHttpService.ListKubeClusters(),
        envHttpService.ListEnvironments(),
        policyHttpService.ListKubernetesPolicies(),
        getPolicySubjectDisplayInfo(configService, logger)
    ]);

    const environmentMap : { [id: string]: EnvironmentSummary } = {};
    (environments).forEach(environmentSummaries => {
        environmentMap[environmentSummaries.id] = environmentSummaries;
    });

    const targetNameMap : { [id: string]: string } = {};
    (clusterTargets).forEach(clusterTarget => {
        targetNameMap[clusterTarget.id] = clusterTarget.name;
    });

    if(!! argv.json) {
        // json output
        return JSON.stringify(kubernetesPolicies);
    } else {
        if (kubernetesPolicies.length === 0){
            logger.info('There are no available Kubernetes policies');
        } else {
            // regular table output
            return getTableOfKubernetesPolicies(kubernetesPolicies, policySubjectDisplayInfo.userMap, environmentMap, targetNameMap, policySubjectDisplayInfo.groupMap, policySubjectDisplayInfo.serviceAccountMap);
        }
    }
}