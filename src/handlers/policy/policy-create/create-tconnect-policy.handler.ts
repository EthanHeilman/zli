import yargs from 'yargs';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { createTConnectPolicyArgs } from './create-policy.command-builder';
import { parseVerbType } from '../../../utils/utils';
import { getUsersByEmail, getGroupsByName, getBaseDacTargetsByNameOrId, getEnvironmentByName } from '../../../utils/policy-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { BzeroTargetHttpService } from '../../../http-services/targets/bzero/bzero.http-services';
import { DynamicAccessConfigHttpService } from '../../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from '../../../../webshell-common-ts/http/v2/policy/types/group.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Target } from '../../../../webshell-common-ts/http/v2/policy/types/target.types';
import { TargetUser } from '../../../../webshell-common-ts/http/v2/policy/types/target-user.types';

export async function createTConnectPolicyHandler(argv: yargs.Arguments<createTConnectPolicyArgs>, configService: ConfigService,logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);
    const baseTargetHttpService = new BzeroTargetHttpService(configService, logger);
    const dynamicAccessHttpService = new DynamicAccessConfigHttpService(configService, logger);

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
        targets = await getBaseDacTargetsByNameOrId(argv.targets, baseTargetHttpService, dynamicAccessHttpService, logger);
    } else {
        environments = await getEnvironmentByName(argv.environments, envHttpService, logger);
    }

    // Process the target users into TargetUser array
    const targetUsers: TargetUser[] = [];
    argv.targetUsers.forEach((tu) => {
        const targetUser: TargetUser = {
            userName: tu
        };
        targetUsers.push(targetUser);
    });

    // Process the verbs into VerbType array
    const verbs = argv.verbs.map((v) => {
        return {
            type: parseVerbType(v)
        };
    });

    // Send the TargetConnectPolicyCreateRequest to AddPolicy endpoint
    const targetConnectPolicy = await policyService.AddTargetConnectPolicy({
        name: argv.name,
        subjects: users,
        groups: groups,
        targets: targets,
        environments: environments,
        targetUsers: targetUsers,
        verbs: verbs,
        description: argv.description
    });

    logger.warn(`Successfully created a new Target Connect Policy. Name: ${targetConnectPolicy.name} ID: ${targetConnectPolicy.id}`);

    await cleanExit(0, logger);
}
