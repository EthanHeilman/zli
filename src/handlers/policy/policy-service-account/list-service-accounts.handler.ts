import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { getTableOfServiceAccounts } from '../../../utils/utils';
import yargs from 'yargs';
import { listServiceAccountsArgs } from './list-service-accounts.command-builder';
import { ServiceAccountHttpService } from '../../../../src/http-services/service-account/service-account.http-services';

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
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfServiceAccounts(serviceAccounts, !!argv.detail);
        console.log(tableString);
    }

    await cleanExit(0, logger);
}