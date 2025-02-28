import {
    isSubstring,
    getTableOfTargets,
    parseTargetType,
    parseTargetStatus
} from 'utils/utils';
import { Logger } from 'services/logger/logger.service';
import { cleanExit } from 'handlers/clean-exit.handler';
import { includes, map, uniq } from 'lodash';
import { ConfigService } from 'services/config/config.service';
import yargs from 'yargs';
import { listTargetsArgs } from 'handlers/list-targets/list-targets.command-builder';
import { listTargets } from 'services/list-targets/list-targets.service';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';

export async function listTargetsHandler(
    configService: ConfigService,
    logger: Logger,
    argv: yargs.Arguments<listTargetsArgs>
) {
    const me = configService.me();
    const isAdmin = me.isAdmin;

    let userEmail;
    if(argv.user) {
        if(! isAdmin) {
            throw Error('Must be an admin to use --user option');
        }
        userEmail = argv.user;
    }

    const targetTypes = (! argv.targetType || argv.targetType.length === 0)
        // Default to all target types if no target type filter has been provided
        ? [TargetType.Linux, TargetType.Windows, TargetType.Kubernetes, TargetType.Db, TargetType.Web, TargetType.DynamicAccessConfig, TargetType.SsmTarget]
        : argv.targetType.map(type => parseTargetType(type));

    let allTargets = await listTargets(configService, logger, targetTypes, userEmail);

    const envHttpService = new EnvironmentHttpService(configService, logger);
    const envs = await envHttpService.ListEnvironments();

    // find all envIds with substring search
    // filter targets down by envIds
    // ref for '!!': https://stackoverflow.com/a/29312197/14782428
    if(!! argv.env) {
        const envIdFilter = envs.filter(e => isSubstring(argv.env, e.name)).map(e => e.id);
        allTargets = allTargets.filter(t => envIdFilter.includes(t.environmentId));
    }

    // filter targets by name/alias
    if(!! argv.name) {
        allTargets = allTargets.filter(t => isSubstring(argv.name, t.name));
    }

    if(!! argv.status) {
        const statusArray: string[] = argv.status;

        let targetStatusFilter: TargetStatus[] = map(statusArray, (s: string) => parseTargetStatus(s)).filter(s => s); // filters out undefined
        targetStatusFilter = uniq(targetStatusFilter);

        allTargets = allTargets.filter(t => includes(targetStatusFilter, t.status));
    }

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(allTargets));
    } else {
        // regular table output
        // We OR the detail and status flags since we want to show the details in both cases
        if(allTargets.length === 0) {
            logger.info('No Targets Found.');
        } else {
            const tableString = getTableOfTargets(allTargets, envs, !! argv.detail || !! argv.status, !! argv.showId);
            console.log(tableString);
        }
    }

    await cleanExit(0, logger);
}