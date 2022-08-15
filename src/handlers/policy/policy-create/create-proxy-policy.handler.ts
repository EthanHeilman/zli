import yargs from 'yargs';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { createProxyPolicyArgs } from './create-policy.command-builder';
import { getUsersByEmail, getGroupsByName, getVirtualTargetsByNameOrId, getEnvironmentByName } from '../../../utils/policy-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { WebTargetService } from '../../../http-services/web-target/web-target.http-service';
import { DbTargetService } from '../../../http-services/db-target/db-target.http-service';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from '../../../../webshell-common-ts/http/v2/policy/types/group.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Target } from '../../../../webshell-common-ts/http/v2/policy/types/target.types';

export async function createProxyPolicyHandler(argv: yargs.Arguments<createProxyPolicyArgs>, configService: ConfigService,logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);
    const dbHttpService = new DbTargetService(configService, logger);
    const webHttpService = new WebTargetService(configService, logger);

    // If a value is provided for neither then throw an error
    // Yargs will handle when a value is passed in for both
    if(argv.targets === undefined && argv.environments === undefined) {
        logger.error('Must exclusively provide a value for targets or environments');
        await cleanExit(1, logger);
    }

    const users: Subject[] = await getUsersByEmail(argv.users, userHttpService, logger);
    let groups: Group[] = [];
    if(argv.groups !== undefined) {
        groups = await getGroupsByName(argv.groups, organizationHttpService, logger);
    }

    let targets: Target[] = null;
    let environments: Environment[] = null;

    if(argv.targets !== undefined) {
        targets = await getVirtualTargetsByNameOrId(argv.targets, dbHttpService, webHttpService, logger);
    } else {
        environments = await getEnvironmentByName(argv.environments, envHttpService, logger);
    }

    // Send the ProxyPolicyCreateRequest to AddPolicy endpoint
    const proxyPolicy = await policyService.AddProxyPolicy({
        name: argv.name,
        subjects: users,
        groups: groups,
        targets: targets,
        environments: environments,
        description: argv.description
    });

    logger.warn(`Successfully created a new Proxy Policy. Name: ${proxyPolicy.name} ID: ${proxyPolicy.id}`);

    await cleanExit(0, logger);
}
