import { Logger } from '../logger.service/logger';
import { ConfigService } from '../config.service/config.service';
import {
    DynamicAccessConfigService,
    EnvironmentService,
    SshTargetService,
    SsmTargetService
} from '../http.service/http.service';
import { TargetSummary } from '../utils';
import { TargetType } from '../types';
import { MixpanelService } from '../mixpanel.service/mixpanel.service';
import { version } from '../../package.json';
import { oauthMiddleware } from '../middlewares/oauth-middleware';
import { LoggerConfigService } from '../logger-config.service/logger-config.service';
import { KeySplittingService } from '../../webshell-common-ts/keysplitting.service/keysplitting.service';


export function fetchDataMiddleware(configService: ConfigService, logger: Logger) {
    // Greedy fetch of some data that we use frequently
    const ssmTargetService = new SsmTargetService(configService, logger);
    const sshTargetService = new SshTargetService(configService, logger);
    const dynamicConfigService = new DynamicAccessConfigService(configService, logger);
    const envService = new EnvironmentService(configService, logger);

    var dynamicConfigs = dynamicConfigService.ListDynamicAccessConfigs()
        .then(result =>
            result.map<TargetSummary>((config, _index, _array) => {
                return {type: TargetType.DYNAMIC, id: config.id, name: config.name, environmentId: config.environmentId};
            })
        );

    var ssmTargets = ssmTargetService.ListSsmTargets(false)
        .then(result =>
            result.map<TargetSummary>((ssm, _index, _array) => {
                return {type: TargetType.SSM, id: ssm.id, name: ssm.name, environmentId: ssm.environmentId};
            })
        );


    var sshTargets = sshTargetService.ListSshTargets()
        .then(result =>
            result.map<TargetSummary>((ssh, _index, _array) => {
                return {type: TargetType.SSH, id: ssh.id, name: ssh.alias, environmentId: ssh.environmentId};
            })
        );

    var envs = envService.ListEnvironments();

    return {
        dynamicConfigs: dynamicConfigs,
        ssmTargets: ssmTargets,
        sshTargets: sshTargets,
        envs: envs
    };
}

export function mixedPanelTrackingMiddleware(configService: ConfigService, argv: any) {
    // Mixpanel tracking
    var mixedPanelService = new MixpanelService(configService);

    // Only captures args, not options at the moment. Capturing configName flag
    // does not matter as that is handled by which mixpanel token is used
    // TODO: capture options and flags
    mixedPanelService.TrackCliCall(
        'CliCommand',
        {
            'cli-version': version,
            'command': argv._[0],
            args: argv._.slice(1)
        }
    );

    return mixedPanelService;
}

export function oAuthMiddleware(configService: ConfigService, logger: Logger) {
    // OAuth
    oauthMiddleware(configService, logger);
    const me = configService.me(); // if you have logged in, this should be set
    const sessionId = configService.sessionId();
    logger.info(`Logged in as: ${me.email}, bzero-id:${me.id}, session-id:${sessionId}`);
}

export async function initMiddleware(argv: any) {
    // Configure our logger
    var loggerConfigService = new LoggerConfigService(<string> argv.configName);
    var logger = new Logger(loggerConfigService, !!argv.debug, !!argv.silent);

    // Config init
    var configService = new ConfigService(<string>argv.configName, logger);

    // KeySplittingService init
    var keySplittingService = new KeySplittingService(configService, logger);
    await keySplittingService.init();

    return {
        loggingConfigService: loggerConfigService,
        logger: logger,
        configService: configService,
        keySplittingService: keySplittingService
    };
}