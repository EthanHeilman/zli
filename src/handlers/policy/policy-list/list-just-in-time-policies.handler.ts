import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import yargs from 'yargs';
import { PolicyHttpService } from '../../../http-services/policy/policy.http-services';
import { getTableOfJustInTimePolicies } from '../../../utils/utils';
import { policyArgs } from './policy-list.command-builder';
import { getPolicySubjectDisplayInfo } from '../../../services/policy/policy.services';

export async function listJustInTimePoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = new PolicyHttpService(configService, logger);

    const [justInTimePolicies, policySubjectDisplayInfo] = await Promise.all([
        policyHttpService.ListJustInTimePolicies(),
        getPolicySubjectDisplayInfo(configService, logger)
    ]);

    if(!! argv.json) {
        // json output
        return JSON.stringify(justInTimePolicies);
    } else {
        if (justInTimePolicies.length === 0){
            logger.info('There are no available Just In Time policies');
        } else {
            // regular table output
            return getTableOfJustInTimePolicies(justInTimePolicies, policySubjectDisplayInfo.userMap, policySubjectDisplayInfo.groupMap);
        }
    }
}