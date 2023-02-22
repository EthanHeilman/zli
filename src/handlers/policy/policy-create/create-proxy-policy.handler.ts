import yargs from 'yargs';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { createProxyPolicyArgs } from './create-policy.command-builder';
import { getGroupsByName, getEnvironmentByName, getSubjectsByEmail, getTargetsByNameOrId, checkAllIdentifiersExist, checkAllIdentifiersAreSingle } from '../../../utils/policy-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { EnvironmentHttpService } from '../../../http-services/environment/environment.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from '../../../../webshell-common-ts/http/v2/policy/types/group.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { Target } from '../../../../webshell-common-ts/http/v2/policy/types/target.types';
import { TargetUser } from '../../../../webshell-common-ts/http/v2/policy/types/target-user.types';
import { SubjectHttpService } from '../../../../src/http-services/subject/subject.http-services';
import { Dictionary } from 'lodash';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';

export async function createProxyPolicyHandler(argv: yargs.Arguments<createProxyPolicyArgs>, configService: ConfigService,logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);
    const subjectHttpService = new SubjectHttpService(configService, logger);

    // If a value is provided for neither then throw an error
    // Yargs will handle when a value is passed in for both
    if(argv.targets === undefined && argv.environments === undefined) {
        logger.error('Must exclusively provide a value for targets or environments');
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

    const targets: Target[] = [];
    let environments: Environment[] = null;
    let vtIdentifierMap: Dictionary<Target[]> = {};
    if(argv.targets !== undefined) {
        vtIdentifierMap = await getTargetsByNameOrId(configService, logger, [TargetType.Db, TargetType.Web]);
        checkAllIdentifiersExist(logger, 'virtual target', vtIdentifierMap, argv.targets);
        checkAllIdentifiersAreSingle(logger, 'virtual target', vtIdentifierMap, argv.targets);
        argv.targets.forEach((target) => {
            // Accessing this with [0] is safe because we have just checked above there is only a single there
            const targetToAdd: Target = vtIdentifierMap[target][0];
            targets.push({
                id: targetToAdd.id,
                type: targetToAdd.type
            });
        });
    } else {
        environments = await getEnvironmentByName(argv.environments, envHttpService, logger);
    }

    // Process the target users, if any, into TargetUser array
    const targetUsers: TargetUser[] = [];
    argv.targetUsers?.forEach((tu) => {
        targetUsers.push({ userName: tu });
    });

    // Send the ProxyPolicyCreateRequest to AddPolicy endpoint
    const proxyPolicy = await policyService.AddProxyPolicy({
        name: argv.name,
        subjects: subjects,
        groups: groups,
        targets: targets,
        environments: environments,
        description: argv.description,
        targetUsers: targetUsers
    });

    logger.warn(`Successfully created a new Proxy Policy. Name: ${proxyPolicy.name} ID: ${proxyPolicy.id}`);

    await cleanExit(0, logger);
}
