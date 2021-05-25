import { IdP, SsmTargetStatus, TargetSummary, TargetType } from './types';
import {
    disambiguateTarget,
    isGuid,
    targetStringExample
} from './utils';
import { ConfigService } from './config.service/config.service';
import { MixpanelService } from './mixpanel.service/mixpanel.service';
import { checkVersionMiddleware } from './middlewares/check-version-middleware';
import { EnvironmentDetails } from './http.service/http.service.types';
import { Logger } from './logger.service/logger';
import { LoggerConfigService } from './logger-config.service/logger-config.service';
import { KeySplittingService } from '../webshell-common-ts/keysplitting.service/keysplitting.service';

// Handlers
import { initMiddleware, oAuthMiddleware, mixedPanelTrackingMiddleware, fetchDataMiddleware } from './handlers/middleware.handler';
import { sshProxyConfigHandler } from './handlers/ssh-proxy-config.handler';
import { sshProxyHandler, SshTunnelParameters } from './handlers/ssh-proxy.handler';
import { loginHandler } from './handlers/login.handler';
import { connectHandler } from './handlers/connect.handler';
import { listTargetsHandler } from './handlers/list-targets.handler';
import { copyHandler } from './handlers/copy.handler';
import { configHandler } from './handlers/config.handler';
import { logoutHandler } from './handlers/logout.handler';

// 3rd Party Modules
import { Dictionary, includes } from 'lodash';
import yargs from 'yargs';
import { cleanExit } from './handlers/clean-exit.handler';
import { autoDiscoveryScriptHandler } from './handlers/autodiscovery-script-handler';
import { listConnectionsHandler } from './handlers/list-connections.handler';
import { attachHandler } from './handlers/attach.handler';
import { closeConnectionHandler } from './handlers/close-connection.handler';


export class CliDriver
{
    private processName: string;
    private configService: ConfigService;
    private keySplittingService: KeySplittingService
    private loggerConfigService: LoggerConfigService;
    private logger: Logger;

    private mixpanelService: MixpanelService;

    private sshTargets: Promise<TargetSummary[]>;
    private ssmTargets: Promise<TargetSummary[]>;
    private dynamicConfigs: Promise<TargetSummary[]>;
    private envs: Promise<EnvironmentDetails[]>;
    private cliSpaceId: Promise<string>;

    // use the following to shortcut middleware according to command
    private noOauthCommands: string[] = ['config', 'login', 'logout'];
    private noMixpanelCommands: string[] = ['config', 'login', 'logout'];
    private noFetchCommands: string[] = ['ssh-proxy-config', 'config', 'login', 'logout'];

    // available options for TargetType autogenerated from enum
    private targetTypeChoices: string[] = Object.keys(TargetType).map(tt => tt.toLowerCase());
    private ssmTargetStatusChoices: string[] = Object.keys(SsmTargetStatus).map(s => s.toLowerCase());

    // Mapping from env vars to options if they exist
    private envMap: Dictionary<string> = {
        'configName': process.env.ZLI_CONFIG_NAME || 'prod',
        'enableKeysplitting': process.env.ZLI_ENABLE_KEYSPLITTING || 'true'
    };

    public start()
    {
        // ref: https://nodejs.org/api/process.html#process_process_argv0
        this.processName = process.argv0;

        yargs(process.argv.slice(2))
            .scriptName('zli')
            .usage('$0 <cmd> [args]')
            .wrap(null)
            .middleware(async (argv) => {
                const initResponse = await initMiddleware(argv);
                this.loggerConfigService = initResponse.loggingConfigService;
                this.logger = initResponse.logger;
                this.configService = initResponse.configService;
                this.keySplittingService = initResponse.keySplittingService;
            })
            .middleware(async () => {
                await checkVersionMiddleware(this.logger);
            })
            .middleware(async (argv) => {
                if(includes(this.noOauthCommands, argv._[0]))
                    return;
                await oAuthMiddleware(this.configService, this.logger);
            })
            .middleware(async (argv) => {
                if(includes(this.noMixpanelCommands, argv._[0]))
                    return;
                this.mixpanelService = mixedPanelTrackingMiddleware(this.configService, argv);
            })
            .middleware((argv) => {
                if(includes(this.noFetchCommands, argv._[0]))
                    return;

                const fetchDataResponse = fetchDataMiddleware(this.configService, this.logger);
                this.dynamicConfigs = fetchDataResponse.dynamicConfigs;
                this.ssmTargets = fetchDataResponse.ssmTargets;
                this.sshTargets = fetchDataResponse.sshTargets;
                this.envs = fetchDataResponse.envs;
            })
            .command(
                'login <provider>',
                'Login through a specific provider',
                (yargs) => {
                    return yargs
                        .positional('provider', {
                            type: 'string',
                            choices: [IdP.Google, IdP.Microsoft]
                        })
                        .option(
                            'mfa',
                            {
                                type: 'string',
                                demandOption: false,
                                alias: 'm'
                            }
                        )
                        .example('login Google', 'Login with Google')
                        .example('login Microsoft --mfa 123456', 'Login with Microsoft and enter MFA');
                },
                async (argv) => {
                    await loginHandler(this.configService, this.logger, argv, this.keySplittingService);
                }
            )
            .command(
                'connect <targetString>',
                'Connect to a target',
                (yargs) => {
                    return yargs
                        .positional('targetString', {
                            type: 'string',
                        })
                        .option(
                            'targetType',
                            {
                                type: 'string',
                                choices: this.targetTypeChoices,
                                demandOption: false,
                                alias: 't'
                            },
                        )
                        .example('connect ssm-user@neat-target', 'SSM connect example, uniquely named ssm target')
                        .example('connect dbda775d-e37c-402b-aa76-bbb0799fd775', 'SSH connect example, unique id of ssh target');
                },
                async (argv) => {
                    const parsedTarget = await disambiguateTarget(argv.targetType, argv.targetString, this.logger, this.dynamicConfigs, this.ssmTargets, this.sshTargets, this.envs);

                    await connectHandler(this.configService, this.logger, this.mixpanelService, parsedTarget);
                }
            )
            .command(
                'attach <connectionId>',
                'Attach to an open zli connection',
                (yargs) => {
                    return yargs
                        .positional('connectionId', {
                            type: 'string',
                        })
                        .example('attach d5b264c7-534c-4184-a4e4-3703489cb917', 'attach example, unique connection id');
                },
                async (argv) => {
                    if (!isGuid(argv.connectionId)){
                        this.logger.error(`Passed connection id ${argv.connectionId} is not a valid Guid`);
                        await cleanExit(1, this.logger);
                    }
                    await attachHandler(this.configService, this.logger, argv.connectionId);
                }
            )
            .command(
                'close <connectionId>',
                'Close an open zli connection',
                (yargs) => {
                    return yargs
                        .positional('connectionId', {
                            type: 'string',
                        })
                        .example('close d5b264c7-534c-4184-a4e4-3703489cb917', 'close example, unique connection id');
                },
                async (argv) => {
                    if (!isGuid(argv.connectionId)){
                        this.logger.error(`Passed connection id ${argv.connectionId} is not a valid Guid`);
                        await cleanExit(1, this.logger);
                    }
                    await closeConnectionHandler(this.configService, this.logger, argv.connectionId);
                }
            )
            .command(
                ['list-targets', 'lt'],
                'List all targets (filters available)',
                (yargs) => {
                    return yargs
                        .option(
                            'targetType',
                            {
                                type: 'string',
                                choices: this.targetTypeChoices,
                                demandOption: false,
                                alias: 't'
                            }
                        )
                        .option(
                            'env',
                            {
                                type: 'string',
                                demandOption: false,
                                alias: 'e'
                            }
                        )
                        .option(
                            'name',
                            {
                                type: 'string',
                                demandOption: false,
                                alias: 'n'
                            }
                        )
                        .option(
                            'status',
                            {
                                type: 'string',
                                array: true,
                                choices: this.ssmTargetStatusChoices,
                                alias: 'u'
                            }
                        )
                        .option(
                            'detail',
                            {
                                type: 'boolean',
                                default: false,
                                demandOption: false,
                                alias: 'd'
                            }
                        )
                        .option(
                            'showId',
                            {
                                type: 'boolean',
                                default: false,
                                demandOption: false,
                                alias: 'i'
                            }
                        )
                        .option(
                            'json',
                            {
                                type: 'boolean',
                                default: false,
                                demandOption: false,
                                alias: 'j',
                            }
                        )
                        .example('lt -t ssm', 'List all SSM targets only')
                        .example('lt -i', 'List all targets and show unique ids')
                        .example('lt -e prod --json --silent', 'List all targets targets in prod, output as json, pipeable');
                },
                async (argv) => {
                    await listTargetsHandler(this.logger, argv, this.dynamicConfigs, this.ssmTargets, this.sshTargets, this.envs);
                }
            )
            .command(
                ['list-connections', 'lc'],
                'List all open zli connections',
                (yargs) => {
                    return yargs
                        .option(
                            'json',
                            {
                                type: 'boolean',
                                default: false,
                                demandOption: false,
                                alias: 'j',
                            }
                        )
                        .example('lc --json', 'List all open zli connections, output as json, pipeable');
                },
                async (argv) => {
                    await listConnectionsHandler(argv, this.configService, this.logger, this.ssmTargets, this.sshTargets);
                }
            )
            .command(
                'copy <source> <destination>',
                'Upload/download a file to target',
                (yargs) => {
                    return yargs
                        .positional('source',
                            {
                                type: 'string'
                            }
                        )
                        .positional('destination',
                            {
                                type: 'string'
                            }
                        )
                        .option(
                            'targetType',
                            {
                                type: 'string',
                                choices: this.targetTypeChoices,
                                demandOption: false,
                                alias: 't'
                            }
                        )
                        .example('copy ssm-user@neat-target:/home/ssm-user/file.txt /Users/coolUser/newFileName.txt', 'Download example, relative to your machine')
                        .example('copy /Users/coolUser/secretFile ssm-user@neat-target:/home/ssm-user/newFileName', 'Upload example, relative to your machine');
                },
                async (argv) => {
                    const sourceParsedTarget = await disambiguateTarget(argv.targetType, argv.source, this.logger, this.dynamicConfigs, this.ssmTargets, this.sshTargets, this.envs);
                    const destParsedTarget = await disambiguateTarget(argv.targetType, argv.destination, this.logger, this.dynamicConfigs, this.ssmTargets, this.sshTargets, this.envs);

                    if(! sourceParsedTarget && ! destParsedTarget)
                    {
                        this.logger.error('Either source or destination must be a valid target string');
                        await cleanExit(1, this.logger);
                    }

                    const isTargetSource = !! sourceParsedTarget;
                    const parsedTarget = sourceParsedTarget || destParsedTarget;
                    const localFilePath = ! isTargetSource ? argv.source : argv.destination;

                    await copyHandler(this.configService, this.logger, parsedTarget, localFilePath, isTargetSource);
                }
            )
            .command(
                'ssh-proxy-config',
                'Generate ssh configuration to be used with the ssh-proxy command',
                (_) => {},
                async (_) => {
                    sshProxyConfigHandler(this.configService, this.logger, this.processName);
                }
            )
            .command(
                'ssh-proxy <host> <user> <port> <identityFile>',
                'SSM targets only, ssh proxy command (run ssh-proxy-config command to generate configuration)',
                (yargs) => {
                    return yargs
                        .positional('host', {
                            type: 'string',
                        })
                        .positional('user', {
                            type: 'string',
                        })
                        .positional('port', {
                            type: 'number',
                        })
                        .positional('identityFile', {
                            type: 'string'
                        });
                },
                async (argv) => {
                    let prefix = 'bzero-';
                    const configName = this.configService.getConfigName();
                    if(configName != 'prod') {
                        prefix = `${configName}-${prefix}`;
                    }

                    if(! argv.host.startsWith(prefix)) {
                        this.logger.error(`Invalid host provided must have form ${prefix}<target>. Target must be either target id or name`);
                        await cleanExit(1, this.logger);
                    }

                    // modify argv to have the targetString and targetType params
                    const targetString = argv.user + '@' + argv.host.substr(prefix.length);
                    const parsedTarget = await disambiguateTarget('ssm', targetString, this.logger, this.dynamicConfigs, this.ssmTargets, this.sshTargets, this.envs);

                    if(argv.port < 1 || argv.port > 65535)
                    {
                        this.logger.warn(`Port ${argv.port} outside of port range [1-65535]`);
                        await cleanExit(1, this.logger);
                    }

                    const sshTunnelParameters: SshTunnelParameters = {
                        parsedTarget: parsedTarget,
                        port: argv.port,
                        identityFile: argv.identityFile
                    };

                    await sshProxyHandler(this.configService, this.logger, sshTunnelParameters, this.keySplittingService, this.envMap);
                }
            )
            .command(
                'config',
                'Returns config file path',
                () => {},
                async () => {
                    await configHandler(this.logger, this.configService, this.loggerConfigService);
                }
            )
            .command(
                'autodiscovery-script <operatingSystem> <targetName> <environmentName> [agentVersion]',
                'Returns autodiscovery script',
                (yargs) => {
                    return yargs
                        .positional('operatingSystem', {
                            type: 'string',
                            choices: ['centos', 'ubuntu']
                        })
                        .positional('targetName', {
                            type: 'string'
                        })
                        .positional('environmentName', {
                            type: 'string',
                        })
                        .positional('agentVersion', {
                            type: 'string',
                            default: 'latest'
                        })
                        .option(
                            'outputFile',
                            {
                                type: 'string',
                                demandOption: false,
                                alias: 'o'
                            }
                        )
                        .example('autodiscovery-script centos sample-target-name Default', '');
                },
                async (argv) => {
                    await autoDiscoveryScriptHandler(argv, this.logger, this.configService, this.envs);
                }
            )
            .command(
                'logout',
                'Deauthenticate the client',
                () => {},
                async () => {
                    await logoutHandler(this.configService, this.logger);
                }
            )
            .option('configName', {type: 'string', choices: ['prod', 'stage', 'dev'], default: this.envMap['configName'], hidden: true})
            .option('debug', {type: 'boolean', default: false, describe: 'Flag to show debug logs'})
            .option('silent', {alias: 's', type: 'boolean', default: false, describe: 'Silence all zli messages, only returns command output'})
            .strict() // if unknown command, show help
            .demandCommand() // if no command, show help
            .help() // auto gen help message
            .epilog(`Note:
 - <targetString> format: ${targetStringExample}
 - TargetStrings only require targetUser for SSM and Dynamic targets
 - TargetPath can be omitted for connect

For command specific help: zli <cmd> help

Command arguments key:
 - <arg> is required
 - [arg] is optional or sometimes required

Need help? https://cloud.bastionzero.com/support`)
            .argv; // returns argv of yargs
    }
}