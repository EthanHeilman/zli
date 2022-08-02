import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { cleanExit } from '../../clean-exit.handler';
import { getTableOfGroups } from '../../../utils/utils';
import yargs from 'yargs';
import { listGroupArgs } from './list-groups.command-builder';
import { OrganizationHttpService } from '../../../http-services/organization/organization.http-services';

export async function listGroupsHandler(
    argv: yargs.Arguments<listGroupArgs>,
    configService: ConfigService,
    logger: Logger,
){
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.FetchGroups();
    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(groups));
    } else {
        if (groups.length === 0){
            logger.info('There are no available groups');
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfGroups(groups);
        console.log(tableString);
    }

    await cleanExit(0, logger);
}