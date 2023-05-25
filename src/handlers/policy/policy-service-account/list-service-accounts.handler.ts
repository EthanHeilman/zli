import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { getTableOfServiceAccounts } from 'utils/utils';
import yargs from 'yargs';
import { listServiceAccountsArgs } from 'handlers/policy/policy-service-account/list-service-accounts.command-builder';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';

export async function listServiceAccountsHandler(
    argv: yargs.Arguments<listServiceAccountsArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
    const serviceAccounts = await serviceAccountHttpService.ListServiceAccounts();
    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(serviceAccounts));
    } else {
        if (serviceAccounts.length === 0){
            logger.info('There are no available service accounts');
            return;
        }
        // regular table output
        const tableString = getTableOfServiceAccounts(serviceAccounts, !!argv.detail);
        console.log(tableString);
    }
}