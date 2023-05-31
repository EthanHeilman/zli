import { ConfigService } from 'services/config/config.service';
import yargs from 'yargs';
import { Logger } from 'services/logger/logger.service';
import { SubjectHttpService } from 'http-services/subject/subject.http-services';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { cleanExit } from 'handlers/clean-exit.handler';
import { ConfigureServiceAccountRequest } from 'webshell-common-ts/http/v2/service-account/requests/configure-service-account.requests';
import { configureServiceAccountArgs } from 'handlers/service-account/configure-service-account.command-builder';
import { checkAllIdentifiersAreSingle, checkAllIdentifiersExist, getTargetsByNameOrId } from 'utils/policy-utils';
import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { MrtapService } from 'webshell-common-ts/mrtap.service/mrtap.service';
import { ServiceAccountHttpService } from 'http-services/service-account/service-account.http-services';
import Utils from 'webshell-common-ts/utility/utils';
import { ServiceAccountConfiguration } from 'webshell-common-ts/http/v2/service-account/types/service-account-configuration.types';
import { SemVer } from 'semver';
import { AgentHttpService } from 'http-services/agent/agent.http-services';
import { Target } from 'webshell-common-ts/http/v2/policy/types/target.types';
import { filterTargetsOnVersion, listTargets } from 'services/list-targets/list-targets.service';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';

const CONFIGURE_MIN_AGENT_VERSION: SemVer = new SemVer('7.3.0');

export async function configureServiceAccountHandler(configService: ConfigService, logger: Logger, mrtapService: MrtapService, argv : yargs.Arguments<configureServiceAccountArgs>) {
    if(configService.me().type != SubjectType.User) {
        logger.error(`You cannot configure targets when logged in as ${configService.me().type}`);
        await cleanExit(1, logger);
    }

    const subjectHttpService = await SubjectHttpService.init(configService, logger);
    const serviceAccountHttpService = await ServiceAccountHttpService.init(configService, logger);
    const agentHttpService = await AgentHttpService.init(configService, logger);

    let subjectSummary: SubjectSummary = null;
    try {
        subjectSummary = await subjectHttpService.GetSubjectByEmail(argv.serviceAccount);
    } catch (error) {
        logger.error(`Unable to find subject with email: ${argv.serviceAccount}`);
        await cleanExit(1, logger);
    }

    if(subjectSummary.type != SubjectType.ServiceAccount)
    {
        logger.error(`The provided subject ${argv.serviceAccount} is not a service account.`);
        await cleanExit(1, logger);
    }

    // Get all targets if specified otherwise get just the specified ones
    let targetIds: string[] = [];
    if(argv.all) {
        const targets = await listTargets(configService, logger, [TargetType.Bzero, TargetType.Cluster]);
        const onlineTargets = targets.filter(t => t.status == TargetStatus.Online);
        const versionFilteredTargets = filterTargetsOnVersion(onlineTargets, CONFIGURE_MIN_AGENT_VERSION);
        targetIds = versionFilteredTargets
            .map(t => t.id);
    } else {
        let targetIdentifierMap: Dictionary<Target[]> = {};

        targetIdentifierMap = await getTargetsByNameOrId(
            configService,
            logger,
            [TargetType.Bzero, TargetType.Cluster],
            CONFIGURE_MIN_AGENT_VERSION);

        checkAllIdentifiersExist(logger, 'target', targetIdentifierMap, argv.target);
        checkAllIdentifiersAreSingle(logger, 'target', targetIdentifierMap, argv.target);

        argv.target.forEach((target) => {
            const targetToAdd: Target = targetIdentifierMap[target][0];
            targetIds.push(targetToAdd.id);
        });
    }

    if(targetIds.length === 0)
    {
        logger.error(`None of the specified targets is able to be configured with a service account.`);
        await cleanExit(1, logger);
    }

    const serviceAccount = await serviceAccountHttpService.GetServiceAccount(subjectSummary.id);
    if(!serviceAccount.enabled) {
        logger.error(`Service account ${serviceAccount.email} is not currently enabled.`);
        await cleanExit(1, logger);
    }

    const serviceAccountConfiguration: ServiceAccountConfiguration = {
        jwksUrlPattern: serviceAccount.jwksUrlPattern
    };
    const signature: string = await mrtapService.signHelper(Utils.JSONstringifyOrder(serviceAccountConfiguration));
    const request: ConfigureServiceAccountRequest = {
        serviceAccountConfiguration: serviceAccountConfiguration,
        targets: targetIds,
        BZCert: await mrtapService.getBZECert(await configService.getIdToken()),
        signature: signature
    };
    await agentHttpService.ConfigureBzeroTarget(request);

    logger.debug(`Attempting to update targets ${request.targets.join(', ')} with service account ${subjectSummary.email}`);
    logger.info(`Attempting to update the specified targets with service account ${subjectSummary.email}`);
    await cleanExit(0, logger);
}