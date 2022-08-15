import yargs from 'yargs';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { createClusterPolicyArgs } from './create-policy.command-builder';
import { getUsersByEmail, getGroupsByName, getClustersByNameOrId, getEnvironmentByName } from '../../../utils/policy-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { KubeHttpService } from '../../../http-services/targets/kube/kube.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from '../../../../webshell-common-ts/http/v2/policy/types/group.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Cluster } from '../../../../webshell-common-ts/http/v2/policy/types/cluster.types';
import { ClusterUser } from '../../../../webshell-common-ts/http/v2/policy/types/cluster-user.types';
import { ClusterGroup } from '../../../../webshell-common-ts/http/v2/policy/types/cluster-group.types';

export async function createClusterPolicyHandler(argv: yargs.Arguments<createClusterPolicyArgs>, configService: ConfigService,logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);
    const kubeHttpService = new KubeHttpService(configService, logger);

    // If a value is provided for neither then throw an error
    // Yargs will handle when a value is passed in for both
    if(argv.clusters === undefined && argv.environments === undefined) {
        logger.error('Must exclusively provide a value for clusters or environments');
        await cleanExit(1, logger);
    }

    const users: Subject[] = await getUsersByEmail(argv.users, userHttpService, logger);
    let groups: Group[] = [];
    if(argv.groups !== undefined) {
        groups = await getGroupsByName(argv.groups, organizationHttpService, logger);
    }

    let clusters: Cluster[] = null;
    let environments: Environment[] = null;

    if(argv.clusters !== undefined) {
        clusters = await getClustersByNameOrId(argv.clusters, kubeHttpService, logger);
    } else {
        environments = await getEnvironmentByName(argv.environments, envHttpService, logger);
    }

    const clusterUsers: ClusterUser[] = [];
    if(argv.targetUsers !== undefined) {
        // Process the target users into ClusterUser array
        argv.targetUsers.forEach((tu) => {
            const clusterUser: ClusterUser = {
                name: tu
            };
            clusterUsers.push(clusterUser);
        });
    }

    const clusterGroups: ClusterGroup[] = [];
    if(argv.targetGroups !== undefined) {
        // Process the target groups into ClusterGroup array
        argv.targetGroups.forEach((tg) => {
            const clusterGroup: ClusterGroup = {
                name: tg
            };
            clusterGroups.push(clusterGroup);
        });
    }

    // Send the KubernetesPolicyCreateRequest to AddPolicy endpoint
    const kubeClusterPolicy = await policyService.AddKubernetesPolicy({
        name: argv.name,
        subjects: users,
        groups: groups,
        clusters: clusters,
        environments: environments,
        clusterUsers: clusterUsers,
        clusterGroups: clusterGroups,
        description: argv.description
    });

    logger.warn(`Successfully created a new Cluster Policy. Name: ${kubeClusterPolicy.name} ID: ${kubeClusterPolicy.id}`);

    await cleanExit(0, logger);
}
