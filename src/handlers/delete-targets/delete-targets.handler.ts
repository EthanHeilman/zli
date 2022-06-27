import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { listTargets } from '../../../src/services/list-targets/list-targets.service';
import { EnvironmentHttpService } from '../../../src/http-services/environment/environment.http-services';
import { DbTargetHttpService } from '../../../src/http-services/db-target/db-target.http-service';
import { BzeroTargetHttpService } from '../../../src/http-services/targets/bzero/bzero.http-services';
import { DynamicAccessConfigHttpService } from '../../../src/http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { KubeHttpService } from '../../../src/http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../../src/http-services/targets/ssm/ssm-target.http-services';
import { WebTargetService as WebTargetHttpService } from '../../../src/http-services/web-target/web-target.http-service';

export async function deleteTargetsHandler(
    configService: ConfigService,
    logger: Logger,
    environmentName: string
){
    const targetTypes = [TargetType.Bzero, TargetType.Cluster, TargetType.Db, TargetType.Web, TargetType.DynamicAccessConfig, TargetType.SsmTarget];

    let allTargets = await listTargets(configService, logger, targetTypes);

    const envHttpService = new EnvironmentHttpService(configService, logger);
    const envs = await envHttpService.ListEnvironments();
    const targetEnvironment = envs.find(e => e.name == environmentName);
    if(targetEnvironment === undefined){
        logger.error(`Environment ${environmentName} does not exist.`);
        await cleanExit(1, logger);
    }

    allTargets = allTargets.filter(t => t.environmentId == targetEnvironment.id);

    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
    const bzeroTargetHttpService = new BzeroTargetHttpService(configService, logger);
    const kubeHttpService = new KubeHttpService(configService, logger);
    const dbTargetHttpService = new DbTargetHttpService(configService, logger);
    const webTargetHttpService = new WebTargetHttpService(configService, logger);

    logger.info(`Deleting ${allTargets.length} targets`);

    await Promise.all(allTargets.map(async target => {
        switch (target.type) {
            case TargetType.SsmTarget:  
                await ssmTargetHttpService.DeleteSsmTarget(target.id);
                break;
            case TargetType.DynamicAccessConfig:
                await dynamicConfigHttpService.DeleteDynamicAccessConfig(target.id);
                break;
            case TargetType.Bzero:
                await bzeroTargetHttpService.DeleteBzeroTarget(target.id);
                break;
            case TargetType.Cluster:
                await kubeHttpService.DeleteKubeCluster(target.id);
                break;
            case TargetType.Db:
                await dbTargetHttpService.DeleteDbTarget(target.id);
                break;
            case TargetType.Web:
                await webTargetHttpService.DeleteWebTarget(target.id);
                break;
            default:
                logger.warn(`Target ${target.name} ${target.id} with target type ${target.type} is not supported to be deleted`);
                break;
        }
    }));


    await cleanExit(0, logger);
}