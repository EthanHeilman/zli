import yargs from 'yargs';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { createRecordingPolicyArgs } from './create-policy.command-builder';
import { getUsersByEmail, getGroupsByName } from '../../../utils/policy-utils';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { UserHttpService } from '../../../http-services/user/user.http-services';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';
import { Group } from '../../../../webshell-common-ts/http/v2/policy/types/group.types';

export async function createRecordingPolicyHandler(argv: yargs.Arguments<createRecordingPolicyArgs>, configService: ConfigService, logger: Logger){
    const policyService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);

    const users: Subject[] = await getUsersByEmail(argv.users, userHttpService, logger);
    let groups: Group[] = [];
    if(argv.groups !== undefined) {
        groups = await getGroupsByName(argv.groups, organizationHttpService, logger);
    }

    // Send the SessionRecordingPolicyCreateRequest to AddPolicy endpoint
    const sessionRecordingPolicy = await policyService.AddSessionRecordingPolicy({
        name: argv.name,
        subjects: users,
        groups: groups,
        recordInput: argv.recordInput,
        description: argv.description
    });

    logger.warn(`Successfully created a new Session Recording Policy. Name: ${sessionRecordingPolicy.name} ID: ${sessionRecordingPolicy.id}`);

    await cleanExit(0, logger);
}
