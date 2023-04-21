import { Logger } from '../../../services/logger/logger.service';
import { ConfigService } from '../../../services/config/config.service';
import { cleanExit } from '../../clean-exit.handler';
import { getTableOfTargetUsers } from '../../../utils/utils';
import yargs from 'yargs';
import { listTargetUserArgs } from './list-targetusers.command-builder';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';

export async function listTargetUsersHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<listTargetUserArgs>, policyName: string) {

    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubernetesPolicies();
    const targetPolicies = await policyHttpService.ListTargetConnectPolicies();
    const proxyPolicies = await policyHttpService.ListProxyPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);
    const targetPolicy = targetPolicies.find(p => p.name == policyName);
    const proxyPolicy = proxyPolicies.find(p => p.name == policyName);

    if (!kubePolicy && !targetPolicy && !proxyPolicy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    const targetUsers : string[] = [];
    if (kubePolicy) {
        kubePolicy.clusterUsers.forEach(
            u => targetUsers.push(u.name)
        );
    } else if (targetPolicy) {
        targetPolicy.targetUsers.forEach(
            u => targetUsers.push(u.userName)
        );
    } else if (proxyPolicy) {
        proxyPolicy.targetUsers.forEach(
            u => targetUsers.push(u.userName)
        );
    }

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(targetUsers));
    } else {
        if (targetUsers.length === 0){
            logger.info('There are no available target users');
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfTargetUsers(targetUsers);
        console.log(tableString);
    }

    await cleanExit(0, logger);
}