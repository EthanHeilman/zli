import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from 'handlers/policy/policy-list/policy-list.command-builder';
import { PolicyHttpService } from 'http-services/policy/policy.http-services';
import { getTableOfSessionRecordingPolicies } from 'utils/utils';
import { getPolicySubjectDisplayInfo } from 'services/policy/policy.services';

export async function listSessionRecordingPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = await PolicyHttpService.init(configService, logger);

    const [ sessionRecordingPolicies, policySubjectDisplayInfo] = await Promise.all([
        policyHttpService.ListSessionRecordingPolicies(),
        getPolicySubjectDisplayInfo(configService, logger)
    ]);

    if(!! argv.json) {
        // json output
        return JSON.stringify(sessionRecordingPolicies);
    } else {
        if (sessionRecordingPolicies.length === 0){
            logger.info('There are no available Session Recording policies');
        } else {
            // regular table output
            return getTableOfSessionRecordingPolicies(sessionRecordingPolicies, policySubjectDisplayInfo.userMap, policySubjectDisplayInfo.groupMap, policySubjectDisplayInfo.serviceAccountMap);
        }
    }
}