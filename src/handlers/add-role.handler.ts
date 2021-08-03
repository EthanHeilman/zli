import { ConfigService } from '../config.service/config.service';
import { PolicyService } from '../http.service/http.service';
import { Logger } from '../logger.service/logger';
import { KubernetesPolicyClusterRoles } from '../http.service/http.service.types';
import { ClusterSummary } from '../types';
import { cleanExit } from './clean-exit.handler';


export async function addRoleHandler(clusterRoleName: string, clusterName: string, force: boolean, clusterTargets: Promise<ClusterSummary[]>, configService: ConfigService, logger: Logger) {
    // First get the existing policy
    const policyService = new PolicyService(configService, logger);
    const policies = await policyService.ListAllPolicies();

    // Check if this is a valid cluster name
    let validRole = false;
    for (const clusterInfo of await clusterTargets) {
        if (clusterInfo.name == clusterName) {
            for (const possibleRole of clusterInfo.validRoles) {
                if (possibleRole == clusterRoleName) {
                    validRole = true;
                }
            }
        }
    }

    // If this is not a valid role, and they have not passed the force flag, exit
    if (validRole == false && force != true) {
        logger.error(`The role chosen: ${clusterRoleName} is not a valid role on the cluster ${clusterName}. If this is a mistake, please use the -f flag. Run zli describe <custerName> to see all valid cluster roles.`);
        await cleanExit(1, logger);
    }

    // Loop till we find the one we are looking for
    for (const policy of policies) {
        if (policy.name == clusterName) {
            // Then add the role to the policy
            const clusterRoleToAdd: KubernetesPolicyClusterRoles = {
                name: clusterRoleName
            };
            policy.context.clusterRoles[clusterRoleName] = clusterRoleToAdd;

            // And finally update the policy
            await policyService.UpdateKubePolicy(policy);

            logger.info(`Added ${clusterRoleName} to ${clusterName} policy!`);
            await cleanExit(0, logger);
        }
    }

    // Log an error
    logger.error(`Unable to find the policy for cluster: ${clusterName}`);
    await cleanExit(1, logger);
}

