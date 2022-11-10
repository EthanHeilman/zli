import { Logger } from '../services/logger/logger.service';
import { ConfigService } from '../services/config/config.service';
import { version } from '../../package.json';
import { oauthMiddleware } from '../middlewares/oauth-middleware';
import { LoggerConfigService } from '../services/logger/logger-config.service';
import { MrtapService } from '../../webshell-common-ts/mrtap.service/mrtap.service';
import { GAService } from '../services/Tracking/google-analytics.service';
import { MixpanelService } from '../services/Tracking/mixpanel.service';
import { isZliSilent } from '../utils/utils';
import { OrganizationHttpService } from '.../../../http-services/organization/organization.http-services';

/*
 * Helper function to get our GA tracking middleware and track our cli command
*/
export async function GATrackingMiddleware(configService: ConfigService, baseCommand: string, logger: Logger, version: string, argvPassed: any,) {
    // GA tracking
    const gaService: GAService = new GAService(configService, logger, baseCommand, argvPassed, version);

    // Capturing configName flag does not matter as that is handled by which GA token is used
    // We slice(1) in order to not capture the baseCommand
    await gaService.TrackCliCommand();
    return gaService;
}

export function mixpanelTrackingMiddleware(configService: ConfigService, argv: any) {
    // Mixpanel tracking
    const mixpanelService = new MixpanelService(configService);

    // Only captures args, not options at the moment. Capturing configName flag
    // does not matter as that is handled by which mixpanel token is used
    // TODO: capture options and flags
    mixpanelService.TrackCliCommand(version, argv._[0], argv._.slice(1));

    return mixpanelService;
}

export async function oAuthMiddleware(configService: ConfigService, logger: Logger) {
    // OAuth
    await oauthMiddleware(configService, logger);
    const me = configService.me(); // if you have logged in, this should be set
    const sessionId = configService.getSessionId();
    logger.info(`Logged in as: ${me.email}, bzero-id:${me.id}, session-id:${sessionId}`);
}

export function initLoggerMiddleware(argv: any) {
    // Configure our logger
    const loggerConfigService = new LoggerConfigService(<string> argv.configName, argv.debug, argv.configDir);

    const isSilent = isZliSilent(!!argv.silent, !!argv.json);
    const logger = new Logger(loggerConfigService, !!argv.debug, isSilent, !!process.stdout.isTTY);

    // isTTY detects whether the process is being run with a text terminal
    // ("TTY") attached. This way we detect whether we should connect
    // logger.error to stderr in order to be able to print error messages to the
    // user (e.g. ssh-proxy mode)
    return {
        logger: logger,
        loggerConfigService: loggerConfigService
    };
}

export async function initMiddleware(argv: any, logger : Logger, isSystemTest : boolean) {
    // Config init
    const configService = new ConfigService(<string>argv.configName, logger, argv.configDir, isSystemTest);

    // MrtapService init
    const mrtapService = new MrtapService(configService, logger);
    await mrtapService.init();

    return {
        configService: configService,
        mrtapService: mrtapService
    };
}

export async function bzCertValidationInfoMiddleware(mrtapService: MrtapService, configService: ConfigService, logger: Logger) {
    const ksConfig = configService.loadMrtap();
    if( ! ksConfig.orgProvider) {
        // Update the Org BZCert Validation parameters
        const orgHttpService = new OrganizationHttpService(configService, logger);
        const orgBZCertValidationInfo = await orgHttpService.GetUserOrganizationBZCertValidationInfo();
        mrtapService.setOrgBZCertValidationInfo(orgBZCertValidationInfo);
    }
}