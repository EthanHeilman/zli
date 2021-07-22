import { IdP, SsmTargetStatus, TargetSummary, ClusterSummary, TargetType } from './types';
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
import { cleanExit } from './handlers/clean-exit.handler';

// Handlers
import { initMiddleware, oAuthMiddleware, mixpanelTrackingMiddleware, fetchDataMiddleware } from './handlers/middleware.handler';
import { sshProxyConfigHandler } from './handlers/ssh-proxy-config.handler';
import { sshProxyHandler, SshTunnelParameters } from './handlers/ssh-proxy.handler';
import { loginHandler } from './handlers/login.handler';
import { connectHandler } from './handlers/connect.handler';
import { listTargetsHandler } from './handlers/list-targets.handler';
import { configHandler } from './handlers/config.handler';
import { logoutHandler } from './handlers/logout.handler';
import { startKubeDaemonHandler } from './handlers/start-kube-daemon.handler';
import { autoDiscoveryScriptHandler } from './handlers/autodiscovery-script-handler';
import { listConnectionsHandler } from './handlers/list-connections.handler';
import { attachHandler } from './handlers/attach.handler';
import { closeConnectionHandler } from './handlers/close-connection.handler';
import { generateKubeconfigHandler } from './handlers/generate-kubeconfig.handler';
import { generateKubeYamlHandler } from './handlers/generate-kube-yaml.handler';

// 3rd Party Modules
import { Dictionary, includes } from 'lodash';
import yargs from 'yargs';

export class CliDriver
{
    private configService: ConfigService;
    private keySplittingService: KeySplittingService
    private loggerConfigService: LoggerConfigService;
    private logger: Logger;

    private mixpanelService: MixpanelService;

    private ssmTargets: Promise<TargetSummary[]>;
    private dynamicConfigs: Promise<TargetSummary[]>;
    private clusterTargets: Promise<ClusterSummary[]>;
    private envs: Promise<EnvironmentDetails[]>;

    // use the following to shortcut middleware according to command
    private noOauthCommands: string[] = ['config', 'login', 'logout', 'getKubeToken'];
    private noMixpanelCommands: string[] = ['config', 'login', 'logout', 'getKubeToken'];
    private noFetchCommands: string[] = ['ssh-proxy-config', 'config', 'login', 'logout', 'getKubeToken'];

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
                this.mixpanelService = mixpanelTrackingMiddleware(this.configService, argv);
            })
            .middleware((argv) => {
                if(includes(this.noFetchCommands, argv._[0]))
                    return;

                const fetchDataResponse = fetchDataMiddleware(this.configService, this.logger);
                this.dynamicConfigs = fetchDataResponse.dynamicConfigs;
                this.clusterTargets = fetchDataResponse.clusterTargets;
                this.ssmTargets = fetchDataResponse.ssmTargets;
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
                        .example('connect --targetType dynamic ssm-user@my-dat-config', 'DAT connect example with a DAT configuration whose name is my-dat-config');
                },
                async (argv) => {
                    const parsedTarget = await disambiguateTarget(argv.targetType, argv.targetString, this.logger, this.dynamicConfigs, this.ssmTargets, this.envs);

                    await connectHandler(this.configService, this.logger, this.mixpanelService, parsedTarget);
                }
            )
            .command(
                'disconnect <targetType>',
                'Disconnect from a target',
                (yargs) => {
                    return yargs
                        .positional('targetType', {
                            type: 'string',
                        })
                        .example('disconnect cluster', 'Disconnect a local kube cluster daemon')
                },
                async (argv) => {
                    if (argv.targetType == 'cluster') {
                        this.logger.info("disconnect from cluster?")
                    } else {
                        this.logger.info(`Unhandled target type passed ${argv.targetType}`)
                    }
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
                'close [connectionId]',
                'Close an open zli connection',
                (yargs) => {
                    return yargs
                        .positional('connectionId', {
                            type: 'string',
                        })
                        .option(
                            'all',
                            {
                                type: 'boolean',
                                default: false,
                                demandOption: false,
                                alias: 'a'
                            }
                        )
                        .example('close d5b264c7-534c-4184-a4e4-3703489cb917', 'close example, unique connection id')
                        .example('close all', 'close all connections in cli-space');
                },
                async (argv) => {
                    if (! argv.all && ! isGuid(argv.connectionId)){
                        this.logger.error(`Passed connection id ${argv.connectionId} is not a valid Guid`);
                        await cleanExit(1, this.logger);
                    }
                    await closeConnectionHandler(this.configService, this.logger, argv.connectionId, argv.all);
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
                    await listTargetsHandler(this.logger, argv, this.dynamicConfigs, this.ssmTargets, this.envs);
                }
            )
            .command(
                ['list-kube-clusters', 'lk'],
                'List all clusters (filters available)',
                (yargs) => {
                    return yargs
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
                            'name',
                            {
                                type: 'string',
                                demandOption: false,
                                alias: 'n'
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
                        .example('lc -i', 'List all clusters and show unique ids')
                },
                async (argv) => {
                    await listClustersHandler(this.logger, argv, this.clusterTargets);
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
                    await listConnectionsHandler(argv, this.configService, this.logger, this.ssmTargets);
                }
            )
            .command(
                'ssh-proxy-config',
                'Generate ssh configuration to be used with the ssh-proxy command',
                (_) => {},
                async (_) => {
                    // ref: https://nodejs.org/api/process.html#process_process_argv0
                    let processName = process.argv0;

                    // handle npm install edge case
                    // note: node will also show up when running 'npm run start -- ssh-proxy-config'
                    // so for devs, they should not rely on generating configs from here and should
                    // map their dev executables in the ProxyCommand output
                    if(processName.includes('node')) processName = 'zli';

                    sshProxyConfigHandler(this.configService, this.logger, processName);
                }
            )
            .command(
                'ssh-proxy <host> <user> <port> <identityFile>',
                'ssh proxy command (run ssh-proxy-config command to generate configuration)',
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
                    const parsedTarget = await disambiguateTarget('ssm', targetString, this.logger, this.dynamicConfigs, this.ssmTargets, this.envs);

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
                'generate <typeOfConfig> <clusterName>',
                'Generate a different types of configuration files',
                (yargs) => {
                    return yargs
                        .positional('typeOfConfig', {
                            type: 'string',
                            choices: ['kubeConfig', 'kubeYaml']
                        
                        }).option(
                            'clusterName',
                            {
                                type: 'string',
                                demandOption: false,
                                alias: 'c',
                                default: null
                            }
                        );
                },
                async (argv) => {
                    if (argv.typeOfConfig == 'kubeConfig') {
                        await generateKubeconfigHandler(this.configService, this.logger);
                    } else if (argv.typeOfConfig == 'kubeYaml') {
                        await generateKubeYamlHandler(argv, this.configService, this.logger);
                    }
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
            .strictCommands() // if unknown command, show help
            .demandCommand() // if no command, show help
            .help() // auto gen help message
            .showHelpOnFail(false)
            .epilog(`Note:
 - <targetString> format: ${targetStringExample}

For command specific help: zli <cmd> help

Command arguments key:
 - <arg> is required
 - [arg] is optional or sometimes required

Need help? https://cloud.bastionzero.com/support`)
            .argv; // returns argv of yargs
    }
}