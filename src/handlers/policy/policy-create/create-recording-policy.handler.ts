import yargs from 'yargs';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { createRecordingPolicyArgs } from 'handlers/policy/policy-create/create-policy.command-builder';
import { getGroupsByName, getSubjectsByEmail } from 'utils/policy-utils';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { OrganizationHttpService } from 'http-services/organization/organization.http-services';
import { Subject } from 'webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from 'webshell-common-ts/http/v2/policy/types/group.types';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';

export async function createRecordingPolicyHandler(argv: yargs.Arguments<createRecordingPolicyArgs>, configService: ConfigService, logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const subjectHttpService = new SubjectHttpService(configService, logger);

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

    // Send the SessionRecordingPolicyCreateRequest to AddPolicy endpoint
    const sessionRecordingPolicy = await policyService.AddSessionRecordingPolicy({
        name: argv.name,
        subjects: subjects,
        groups: groups,
        recordInput: argv.recordInput,
        description: argv.description
    });

    logger.warn(`Successfully created a new Session Recording Policy. Name: ${sessionRecordingPolicy.name} ID: ${sessionRecordingPolicy.id}`);

    await cleanExit(0, logger);
}
