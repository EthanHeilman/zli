import yargs from 'yargs';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { createTConnectPolicyArgs } from 'handlers/policy/policy-create/create-policy.command-builder';
import { parseVerbType } from 'utils/utils';
import { getGroupsByName, getEnvironmentByName, getSubjectsByEmail, getTargetsByNameOrId, checkAllIdentifiersExist, checkAllIdentifiersAreSingle } from 'utils/policy-utils';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { OrganizationHttpService } from 'http-services/organization/organization.http-services';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from 'webshell-common-ts/http/v2/policy/types/group.types';
import { Environment } from 'webshell-common-ts/http/v2/policy/types/environment.types';
import { Target } from 'webshell-common-ts/http/v2/policy/types/target.types';
import { TargetUser } from 'webshell-common-ts/http/v2/policy/types/target-user.types';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { Dictionary } from 'lodash';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';

export async function createTConnectPolicyHandler(argv: yargs.Arguments<createTConnectPolicyArgs>, configService: ConfigService,logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const subjectHttpService = new SubjectHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);

    // If a value is provided for neither then throw an error
    // Yargs will handle when a value is passed in for both
    if(argv.targets === undefined && argv.environments === undefined) {
        throw new Error('Must exclusively provide a value for targets or environments');
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
    let targetIdentifierMap: Dictionary<Target[]> = {};

    if(argv.targets !== undefined) {
        targetIdentifierMap = await getTargetsByNameOrId(configService, logger, [TargetType.Bzero, TargetType.DynamicAccessConfig]);
        checkAllIdentifiersExist(logger, 'bzero target or dynamic access config', targetIdentifierMap, argv.targets);
        checkAllIdentifiersAreSingle(logger, 'bzero target or dynamic access config', targetIdentifierMap, argv.targets);
        argv.targets.forEach((target) => {
            // Accessing this with [0] is safe because we have just checked above there is only a single target there
            const targetToAdd: Target = targetIdentifierMap[target][0];
            targets.push({
                id: targetToAdd.id,
                type: targetToAdd.type
            });
        });
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
        subjects: subjects,
        groups: groups,
        targets: targets,
        environments: environments,
        targetUsers: targetUsers,
        verbs: verbs,
        description: argv.description
    });

    logger.warn(`Successfully created a new Target Connect Policy. Name: ${targetConnectPolicy.name} ID: ${targetConnectPolicy.id}`);
}
