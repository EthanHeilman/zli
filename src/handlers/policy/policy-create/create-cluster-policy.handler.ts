import yargs from 'yargs';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { createClusterPolicyArgs } from 'handlers/policy/policy-create/create-policy.command-builder';
import { getGroupsByName, getEnvironmentByName, getSubjectsByEmail, checkAllIdentifiersExist, checkAllIdentifiersAreSingle, getTargetsByNameOrId } from 'utils/policy-utils';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { OrganizationHttpService } from 'http-services/organization/organization.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from 'webshell-common-ts/http/v2/policy/types/group.types';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { Cluster } from 'webshell-common-ts/http/v2/policy/types/cluster.types';
import { ClusterUser } from 'webshell-common-ts/http/v2/policy/types/cluster-user.types';
import { ClusterGroup } from 'webshell-common-ts/http/v2/policy/types/cluster-group.types';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { Target } from 'webshell-common-ts/http/v2/policy/types/target.types';
import { Dictionary } from 'lodash';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';

export async function createClusterPolicyHandler(argv: yargs.Arguments<createClusterPolicyArgs>, configService: ConfigService,logger: Logger){
    const policyService = await PolicyHttpService.init(configService, logger);
    const organizationHttpService = await OrganizationHttpService.init(configService, logger);
    const subjectHttpService = await SubjectHttpService.init(configService, logger);
    const envHttpService = await EnvironmentHttpService.init(configService, logger);

    // If a value is provided for neither then throw an error
    // Yargs will handle when a value is passed in for both
    if(argv.clusters === undefined && argv.environments === undefined) {
        logger.error('Must exclusively provide a value for clusters or environments');
        await cleanExit(1, logger);
    }

    let subjectsEmails: string[];
    if(argv.users) {
        logger.warn('The users flag is deprecated and will be removed soon, please use its equivalent \'subjects\'');
        subjectsEmails = argv.users;
    } else
        subjectsEmails = argv.subjects;
    const subjects: Subject[] = await getSubjectsByEmail(subjectsEmails, subjectHttpService, logger);
    let groups: Group[] = [];
    if(argv.groups !== undefined) {
        groups = await getGroupsByName(argv.groups, organizationHttpService, logger);
    }

    let clustersIdentifierMap: Dictionary<Target[]> = {};
    let environments: Environment[] = null;
    const clusters: Cluster[] = [];

    if(argv.clusters !== undefined) {
        clustersIdentifierMap = await getTargetsByNameOrId(configService, logger, [TargetType.Cluster]);
        checkAllIdentifiersExist(logger, 'cluster', clustersIdentifierMap, argv.clusters);
        checkAllIdentifiersAreSingle(logger, 'cluster', clustersIdentifierMap, argv.clusters);
        argv.clusters.forEach((cluster) => {
            // Accessing this with [0] is safe because we have just checked above there is only a single tar
            const clusterToAdd: Target = clustersIdentifierMap[cluster][0];
            clusters.push({
                id: clusterToAdd.id
            });
        });
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
        subjects: subjects,
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
