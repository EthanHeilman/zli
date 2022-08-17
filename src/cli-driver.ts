import {
    isGuid,
    makeCaseInsensitive,
    targetStringExample,
    getZliRunCommand,
    targetTypeDisplay,
    verbTypeDisplay
} from './utils/utils';
import { ConfigService } from './services/config/config.service';
import { checkVersionMiddleware } from './middlewares/check-version-middleware';
import { Logger } from './services/logger/logger.service';
import { LoggerConfigService } from './services/logger/logger-config.service';
import { KeySplittingService } from '../webshell-common-ts/keysplitting.service/keysplitting.service';
import { OAuthService } from './services/oauth/oauth.service';
import { cleanExit } from './handlers/clean-exit.handler';
import { GAService } from './services/Tracking/google-analytics.service';
import { MixpanelService } from './services/Tracking/mixpanel.service';
import { TargetType } from '../webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from '../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { version } from '../package.json';
import { PolicyType } from '../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { VerbType } from '../webshell-common-ts/http/v2/policy/types/verb-type.types';

// Handlers
import { initMiddleware, oAuthMiddleware, GATrackingMiddleware, initLoggerMiddleware, mixpanelTrackingMiddleware, bzCertValidationInfoMiddleware } from './handlers/middleware.handler';
import { sshProxyHandler } from './handlers/ssh-proxy/ssh-proxy.handler';
import { loginHandler } from './handlers/login/login.handler';
import { listTargetsHandler } from './handlers/list-targets/list-targets.handler';
import { configHandler } from './handlers/config.handler';
import { logoutHandler } from './handlers/logout.handler';
import { connectHandler } from './handlers/connect/connect.handler';
import { listConnectionsHandler } from './handlers/list-connections/list-connections.handler';
import { attachHandler } from './handlers/attach/attach.handler';
import { closeConnectionHandler } from './handlers/close-connection/close-connection.handler';
import { generateKubeYamlHandler } from './handlers/generate/generate-kube-yaml.handler';
import { disconnectHandler } from './handlers/disconnect/disconnect.handler';
import { statusHandler } from './handlers/status/status.handler';
import { bctlHandler } from './handlers/bctl.handler';
import { generateBashHandler } from './handlers/generate/generate-bash.handler';
import { quickstartHandler } from './handlers/quickstart/quickstart-handler';
import { describeClusterPolicyHandler } from './handlers/policy/policy-describe-cluster/describe-cluster-policy.handler';
import { quickstartCmdBuilder } from './handlers/quickstart/quickstart.command-builder';
import { defaultTargetGroupHandler } from './handlers/default-target-group/default-target-group.handler';
import { createRecordingPolicyHandler } from './handlers/policy/policy-create/create-recording-policy.handler';
import { createProxyPolicyHandler } from './handlers/policy/policy-create/create-proxy-policy.handler';
import { createTConnectPolicyHandler } from './handlers/policy/policy-create/create-tconnect-policy.handler';
import { createClusterPolicyHandler } from './handlers/policy/policy-create/create-cluster-policy.handler';
import { listUsersHandler } from './handlers/policy/policy-user/list-users.handler';
import { addUserToPolicyHandler } from './handlers/policy/policy-user/add-user-policy.handler';
import { deleteUserFromPolicyHandler } from './handlers/policy/policy-user/delete-user-policy.handler';
import { listGroupsHandler } from './handlers/policy/policy-group/list-groups.handler';
import { addGroupToPolicyHandler } from './handlers/policy/policy-group/add-group-policy.handler';
import { deleteGroupFromPolicyHandler } from './handlers/policy/policy-group/delete-group-policy-handler';
import { listTargetUsersHandler } from './handlers/policy/policy-targetuser/list-targetusers.handler';
import { addTargetUserToPolicyHandler } from './handlers/policy/policy-targetuser/add-targetuser-policy.handler';
import { deleteTargetUserFromPolicyHandler } from './handlers/policy/policy-targetuser/delete-targetuser-policy.handler';
import { listTargetGroupsHandler } from './handlers/policy/policy-targetgroup/list-targetgroups.handler';
import { addTargetGroupToPolicyHandler } from './handlers/policy/policy-targetgroup/add-targetgroup-policy.handler';
import { deleteTargetGroupFromPolicyHandler } from './handlers/policy/policy-targetgroup/delete-targetgroup-policy.handler';
import { listPoliciesHandler } from './handlers/policy/policy-list/list-policies.handler';
import { generateKubeConfigHandler } from './handlers/generate/generate-kube-config.handler';
import { generateSshConfigHandler } from './handlers/generate/generate-ssh-config.handler';
import { sshProxyConfigHandler } from './handlers/generate/generate-ssh-proxy.handler';


// 3rd Party Modules
import yargs from 'yargs/yargs';

// Cmd builders
import { loginCmdBuilder } from './handlers/login/login.command-builder';
import { connectCmdBuilder } from './handlers/connect/connect.command-builder';
import { statusCmdBuilder } from './handlers/status/status.command-builder';
import { listPoliciesCmdBuilder } from './handlers/policy/policy-list/policy-list.command-builder';
import { describeClusterPolicyCmdBuilder } from './handlers/policy/policy-describe-cluster/describe-cluster-policy.command-builder';
import { disconnectCmdBuilder } from './handlers/disconnect/disconnect.command-builder';
import { attachCmdBuilder } from './handlers/attach/attach.command-builder';
import { closeConnectionCmdBuilder } from './handlers/close-connection/close-connection.command-builder';
import { listTargetsCmdBuilder } from './handlers/list-targets/list-targets.command-builder';
import { listConnectionsCmdBuilder } from './handlers/list-connections/list-connections.command-builder';
import { createClusterPolicyCmdBuilder, createTConnectPolicyCmdBuilder, createRecordingPolicyCmdBuilder, createProxyPolicyCmdBuilder } from './handlers/policy/policy-create/create-policy.command-builder';
import { listUsersCmdBuilder } from './handlers/policy/policy-user/list-users.command-builder';
import { addUserToPolicyCmdBuilder } from './handlers/policy/policy-user/add-user-policy.command-builder';
import { deleteUserFromPolicyCmdBuilder } from './handlers/policy/policy-user/delete-user-policy.command-builder';
import { listGroupsCmdBuilder } from './handlers/policy/policy-group/list-groups.command-builder';
import { addGroupToPolicyCmdBuilder } from './handlers/policy/policy-group/add-group-policy.command-builder';
import { deleteGroupFromPolicyCmdBuilder } from './handlers/policy/policy-group/delete-group-policy.command-builder';
import { listTargetUserCmdBuilder } from './handlers/policy/policy-targetuser/list-targetusers.command-builder';
import { addTargetUserToPolicyCmdBuilder } from './handlers/policy/policy-targetuser/add-targetuser-policy.command-builder';
import { deleteTargetUserFromPolicyCmdBuilder } from './handlers/policy/policy-targetuser/delete-targetuser-policy.command-builder';
import { listTargetGroupsCmdBuilder } from './handlers/policy/policy-targetgroup/list-targetgroups.command-builder';
import { addTargetGroupToPolicyCmdBuilder } from './handlers/policy/policy-targetgroup/add-targetgroup-policy.command-builder';
import { deleteTargetGroupFromPolicyCmdBuilder } from './handlers/policy/policy-targetgroup/delete-targetgroup-policy.command-builder';
import { sshProxyCmdBuilder } from './handlers/ssh-proxy/ssh-proxy.command-builder';
import { generateKubeConfigCmdBuilder, generateKubeYamlCmdBuilder } from './handlers/generate/generate-kube.command-builder';
import { generateBashCmdBuilder } from './handlers/generate/generate-bash.command-builder';
import { defaultTargetGroupCmdBuilder } from './handlers/default-target-group/default-target-group.command-builder';
import { UserHttpService } from './http-services/user/user.http-services';
import { generateSshConfigCmdBuilder } from './handlers/generate/generate-ssh-config.command-builder';
import { createApiKeyCmdBuilder } from './handlers/api-key/create-api-key.command-builder';
import { createApiKeyHandler } from './handlers/api-key/create-api-key.handler';

export type EnvMap = Readonly<{
    configName: string;
    configDir: string;
}>;

// Mapping from env vars to options if they exist
export const envMap: EnvMap = {
    'configName'        : process.env.ZLI_CONFIG_NAME           || 'prod',
    'configDir'         : process.env.ZLI_CONFIG_DIR            || undefined
};

export class CliDriver
{
    private configService: ConfigService;
    private keySplittingService: KeySplittingService;
    private loggerConfigService: LoggerConfigService;
    private logger: Logger;

    private GAService: GAService;
    private mixpanelService: MixpanelService;

    private availableCommands: Set<string> = new Set([
        'login',
        'connect',
        'status',
        'disconnect',
        'default-targetgroup',
        'generate',
        'policy',
        'attach',
        'close',
        'list-targets',
        'lt',
        'list-connections',
        'lc',
        'ssh-proxy-config',
        'ssh-proxy',
        'configure',
        'quickstart',
        'logout',
        'kube',
        'refresh',
        'register',
        'api-key',
    ]);

    // use the following to shortcut middleware according to command
    private oauthCommands: Set<string> = new Set([
        'kube',
        'ssh-proxy-config',
        'connect',
        'disconnect',
        'attach',
        'close',
        'list-targets',
        'lt',
        'list-connections',
        'lc',
        'ssh-proxy',
        'policy',
        'register',
        'generate',
        'api-key'
    ]);

    private GACommands: Set<string> = new Set([
        'kube',
        'ssh-proxy-config',
        'connect',
        'disconnect',
        'attach',
        'close',
        'list-targets',
        'lt',
        'list-connections',
        'lc',
        'ssh-proxy',
        'generate',
        'policy',
    ]);

    private adminOnlyCommands: Set<string> = new Set([
        'policy',
        'api-key'
    ]);

    // available options for TargetType autogenerated from enum
    private targetTypeChoices: string[] = Object.values(TargetType).map(tt => targetTypeDisplay(tt).toLowerCase());
    private targetStatusChoices: string[] = Object.keys(TargetStatus).map(s => s.toLowerCase());
    private verbTypeChoices: string[] = Object.values(VerbType).map(vt => verbTypeDisplay(vt).toLowerCase());

    // available options for PolicyType autogenerated from enum
    private policyTypeChoices: string[] = Object.keys(PolicyType).map(s => s.toLowerCase());

    private getCliDriver(isSystemTest: boolean, baseCmd: string) {
        return yargs()
            .scriptName('zli')
            .usage('$0 <cmd> [args]')
            .wrap(null)
            .middleware((argv) => {
                // By passing true as the second argument to this middleware
                // configuration, this.logger is guaranteed to be initialized
                // prior to validation checks. This implies that logger will
                // exist in fail() defined at the bottom of this file.
                const initLoggerResponse = initLoggerMiddleware(argv);
                this.logger = initLoggerResponse.logger;
                this.loggerConfigService = initLoggerResponse.loggerConfigService;
            })
            .middleware(async (argv) => {
                const initResponse = await initMiddleware(argv, this.logger, isSystemTest);
                this.configService = initResponse.configService;
                this.keySplittingService = initResponse.keySplittingService;
            })
            .middleware(async (argv) => {
                if(argv['_'].length !== 0) {
                    if(baseCmd != argv['_'][0]) {
                        this.logger.error(`You have provided ${baseCmd} and ${argv['_'][0]}. You cannot specify more than one zli commands.`);
                        await cleanExit(1, this.logger);
                    }
                }
            })
            .middleware(async (_) => {
                if(!this.GACommands.has(baseCmd)) {
                    this.GAService = null;
                    return;
                }

                // Attempt to re-get the token if we dont have it
                if(! this.configService.GAToken()) {
                    await this.configService.fetchGAToken();
                }

                let argvPassed: any = [];
                if (!isSystemTest) {
                    // If we are not running a system tests, attempt to extract the args passed
                    argvPassed = process.argv.slice(3);
                }
                this.GAService = await GATrackingMiddleware(this.configService, baseCmd, this.logger, version, argvPassed);

                // We set the GA service here since it would otherwise be a circular dependency and we need the configService
                // to be initialized prior
                this.logger.setGAService(this.GAService);
            })
            .middleware(async (argv) => {
                if(!this.GACommands.has(baseCmd))
                    return;
                if(!this.configService.mixpanelToken()) {
                    await this.configService.fetchMixpanelToken();
                }
                this.mixpanelService = mixpanelTrackingMiddleware(this.configService, argv);
            })
            .middleware(async (_) => {
                if(!(this.oauthCommands.has(baseCmd)))
                    return;
                await checkVersionMiddleware(this.configService, this.logger);
            })
            .middleware(async () => {
                if(!this.oauthCommands.has(baseCmd))
                    return;
                await oAuthMiddleware(this.configService, this.logger);
            })
            .middleware(async (argv) => {
                const isGenerateBash = argv._[0] == 'generate' && argv._[1] == 'bash';
                if((this.adminOnlyCommands.has(baseCmd) || isGenerateBash) && !this.configService.me().isAdmin){
                    this.logger.error(`This is an admin restricted command. Please login as an admin to perform it.`);
                    await cleanExit(1, this.logger);
                }
            })
            // Middleware to ensure that BZCertValidation Info is set in the keysplitting config
            .middleware(async () => {
                // Makes a Bastion API call so oauth middleware must have run
                // first to ensure session token is set
                if(!this.oauthCommands.has(baseCmd) || baseCmd === 'register')
                    return;
                await bzCertValidationInfoMiddleware(this.keySplittingService, this.configService, this.logger);
            })
            .command(
                'login',
                'Login through your identity provider',
                (yargs) => {
                    return loginCmdBuilder(yargs);
                },
                async (argv) => {
                    const loginResult = await loginHandler(this.configService, this.logger, argv, this.keySplittingService);

                    if (loginResult) {
                        const me = loginResult.userSummary;
                        this.logger.info(`Logged in as: ${me.email}, bzero-id:${me.id}, session-id:${this.configService.getSessionId()}`);
                        await cleanExit(0, this.logger);
                    } else {
                        await cleanExit(1, this.logger);
                    }
                }
            )
            .command(
                'connect <targetString>',
                'Connect to a target',
                (yargs) => {
                    return connectCmdBuilder(yargs, this.targetTypeChoices);
                },
                async (argv) => {
                    const exitCode = await connectHandler(argv, this.configService, this.logger, this.loggerConfigService, this.mixpanelService);
                    await cleanExit(exitCode, this.logger);
                }
            )
            .command(
                'status [targetType]',
                'Get status of a running daemon',
                (yargs) => {
                    return statusCmdBuilder(yargs);
                },
                async (argv) => {
                    await statusHandler(argv, this.configService, this.logger);
                }
            )
            .command(
                'disconnect [targetType]',
                'Disconnect a zli daemon (db, web or kube)',
                (yargs) => {
                    return disconnectCmdBuilder(yargs);
                },
                async (argv) => {
                    await disconnectHandler(argv, this.configService, this.logger);
                }
            )
            .command(
                'default-targetgroup',
                'Update the default target group',
                (yargs) => {
                    return defaultTargetGroupCmdBuilder(yargs);
                },
                async (argv) => {
                    await defaultTargetGroupHandler(this.configService, this.logger, argv);
                }
            )
            .command(
                'generate <typeOfConfig>',
                'Generate different types of configuration files (bash, sshConfig, ssh-proxy, kubeConfig or kubeYaml)',
                (yargs) => {
                    return yargs
                        .command(
                            'bash',
                            'Print a bash script to autodiscover a target',
                            (yargs) => generateBashCmdBuilder(yargs),
                            async (argv) => await generateBashHandler(argv, this.configService, this.logger),
                        )
                        .command(
                            'sshConfig',
                            'Generate a configuration file for ssh',
                            (yargs) => generateSshConfigCmdBuilder(yargs),
                            async (argv) => await generateSshConfigHandler(argv, this.configService, this.logger, getZliRunCommand())
                        )
                        .command(
                            'ssh-proxy',
                            'Print an ssh configuration to be used with the ssh-proxy command',
                            () => {},
                            () => sshProxyConfigHandler(this.configService, getZliRunCommand(), this.logger),
                        )
                        .command(
                            'kubeConfig',
                            'Generate a configuration file for Kubernetes',
                            (yargs) => generateKubeConfigCmdBuilder(yargs),
                            async (argv) => await generateKubeConfigHandler(argv, this.configService, this.logger)
                        )
                        .command(
                            'kubeYaml [clusterName]',
                            'Generate a yaml file for Kubernetes.',
                            (yargs) => generateKubeYamlCmdBuilder(yargs),
                            async (argv) => await generateKubeYamlHandler(argv, this.configService, this.logger)
                        )
                        .demandCommand(1, '')
                        .strict();
                },
            )
            .command(
                ['policy'],
                'List, create and update functionality for policies',
                (yargs) => {
                    return yargs
                        .command(
                            'list [type]',
                            'List all policies',
                            (yargs) => {
                                return listPoliciesCmdBuilder(yargs, this.policyTypeChoices);
                            },
                            async (argv) => {
                                await listPoliciesHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'describe-cluster-policy <clusterName>',
                            'List the detailed information about what policies apply to a given cluster',
                            (yargs) => {
                                return describeClusterPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await describeClusterPolicyHandler(argv.clusterName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'users',
                            'List the BastionZero users in the organization',
                            (yargs) => {
                                return listUsersCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await listUsersHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'groups',
                            'List the organization\'s SSO groups',
                            (yargs) => {
                                return listGroupsCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await listGroupsHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'targetusers <policyName>',
                            'List the given policy\'s target users',
                            (yargs) => {
                                return listTargetUserCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await listTargetUsersHandler(this.configService, this.logger, argv, argv.policyName);
                            }
                        )
                        .command(
                            'targetgroups <policyName>',
                            'List the given policy\'s target groups',
                            (yargs) => {
                                return listTargetGroupsCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await listTargetGroupsHandler(this.configService, this.logger, argv, argv.policyName);
                            }
                        )
                        .command(
                            'add-user <policyName> <idpEmail>',
                            'Add a user to an existing policy',
                            (yargs) => {
                                return addUserToPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await addUserToPolicyHandler(argv.idpEmail, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'add-group <policyName> <groupName>',
                            'Add a group to an existing policy',
                            (yargs) => {
                                return addGroupToPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await addGroupToPolicyHandler(argv.groupName, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'add-targetuser <policyName> <targetUser>',
                            'Add a target user to an existing policy',
                            (yargs) => {
                                return addTargetUserToPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await addTargetUserToPolicyHandler(argv.targetUser, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'add-targetgroup <policyName> <targetGroup>',
                            'Add a target group to an existing policy',
                            (yargs) => {
                                return addTargetGroupToPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await addTargetGroupToPolicyHandler(argv.targetGroup, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'create-cluster',
                            'Create a cluster policy. See help menu for required and optional flags.',
                            (yargs) => {
                                return createClusterPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await createClusterPolicyHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'create-tconnect',
                            'Create a target connect policy. See help menu for required and optional flags.',
                            (yargs) => {
                                return createTConnectPolicyCmdBuilder(yargs, this.verbTypeChoices);
                            },
                            async (argv) => {
                                await createTConnectPolicyHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'create-recording',
                            'Create a session recording policy. See help menu for required and optional flags.',
                            (yargs) => {
                                return createRecordingPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await createRecordingPolicyHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'create-proxy',
                            'Create a proxy policy. See help menu for required and optional flags.',
                            (yargs) => {
                                return createProxyPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await createProxyPolicyHandler(argv, this.configService, this.logger);
                            }
                        )
                        .command(
                            'delete-user <policyName> <idpEmail>',
                            'Delete a user from an existing policy',
                            (yargs) => {
                                return deleteUserFromPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await deleteUserFromPolicyHandler(argv.idpEmail, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'delete-group <policyName> <groupName>',
                            'Delete a group from an existing policy',
                            (yargs) => {
                                return deleteGroupFromPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await deleteGroupFromPolicyHandler(argv.groupName, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'delete-targetuser <policyName> <targetUser>',
                            'Delete a target user from an existing policy',
                            (yargs) => {
                                return deleteTargetUserFromPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await deleteTargetUserFromPolicyHandler(argv.targetUser, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .command(
                            'delete-targetgroup <policyName> <targetGroup>',
                            'Delete a target group from an existing policy',
                            (yargs) => {
                                return deleteTargetGroupFromPolicyCmdBuilder(yargs);
                            },
                            async (argv) => {
                                await deleteTargetGroupFromPolicyHandler(argv.targetGroup, argv.policyName, this.configService, this.logger);
                            }
                        )
                        .demandCommand(1, '')
                        .strict();
                },
            )
            .command(
                'attach <connectionId>',
                'Attach to an open zli connection',
                (yargs) => {
                    return attachCmdBuilder(yargs);
                },
                async (argv) => {
                    if (!isGuid(argv.connectionId)){
                        this.logger.error(`Passed connection id ${argv.connectionId} is not a valid Guid`);
                        await cleanExit(1, this.logger);
                    }

                    const exitCode = await attachHandler(this.configService, this.logger, this.loggerConfigService, argv.connectionId);
                    await cleanExit(exitCode, this.logger);
                }
            )
            .command(
                'close [connectionId]',
                'Close an open zli connection',
                (yargs) => {
                    return closeConnectionCmdBuilder(yargs);
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
                    return listTargetsCmdBuilder(yargs, this.targetTypeChoices, this.targetStatusChoices);
                },
                async (argv) => {
                    await listTargetsHandler(this.configService,this.logger, argv);
                }
            )
            .command(
                ['list-connections', 'lc'],
                'List all open zli connections',
                (yargs) => {
                    return listConnectionsCmdBuilder(yargs);
                },
                async (argv) => {
                    await listConnectionsHandler(argv, this.configService, this.logger);
                }
            )
            .command(
                'ssh-proxy-config',
                'Generate ssh configuration to be used with the ssh-proxy command',
                () => {},
                async () => {
                    await sshProxyConfigHandler(this.configService, getZliRunCommand(), this.logger);
                    this.logger.warn('The ssh-proxy-config command is deprecated and will be removed soon, please use its equivalent \'zli generate ssh-proxy\'');
                },
                [],
                true // deprecated = true
            )
            .command(
                'ssh-proxy <host> <user> <port> <identityFile>',
                'ssh proxy command (run generate ssh-proxy command to generate configuration)',
                (yargs) => {
                    return sshProxyCmdBuilder(yargs);
                },
                async (argv) => {
                    await sshProxyHandler(argv, this.configService, this.logger, this.keySplittingService, this.loggerConfigService);
                }
            )
            .command(
                'configure',
                'Returns config file path',
                () => {},
                async () => {
                    await configHandler(this.logger, this.configService, this.loggerConfigService);
                }
            )
            .command(
                'quickstart',
                'Start an interactive onboarding session to add your SSH hosts to BastionZero.',
                (yargs) => {
                    return quickstartCmdBuilder(yargs);
                },
                async (argv) => {
                    await quickstartHandler(argv, this.logger, this.keySplittingService, this.configService);
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
            .command('kube', 'Kubectl wrapper catch all', (yargs) => {
                return yargs.example('$0 kube -- get pods', '');
            }, async (argv: any) => {
                // This expects that the kube command will go after the --
                const listOfCommands = argv._.slice(1); // this removes the 'kube' part of 'zli kube -- ...'
                await bctlHandler(this.configService, this.logger, listOfCommands);
            })
            .command(
                'refresh',
                false,
                () => {},
                async () => {
                    const oauth = new OAuthService(this.configService, this.logger);
                    await oauth.getIdTokenAndExitOnError();
                }
            )
            .command(
                'register',
                false,
                () => {},
                async () => {
                    const userHttpService = new UserHttpService(this.configService, this.logger);
                    await userHttpService.Register();

                    // Update me
                    const me = await userHttpService.Me();
                    this.configService.setMe(me);
                }
            )
            .command(
                // This grouping hosts all api-key related commands
                'api-key',
                false,
                async (yargs) => {
                    return yargs
                        .command(
                            'create <name>',
                            'Create an API key',
                            (yargs) => createApiKeyCmdBuilder(yargs),
                            async (argv) => await createApiKeyHandler(argv, this.logger, this.configService),
                        )
                        .demandCommand(1, 'api-key requires a sub-command. Specify --help for available options');
                },
            )
            .option('configName', {type: 'string', choices: ['prod', 'stage', 'dev'], default: envMap.configName, hidden: true})
            // Overwrites the default directory used by conf. Used by
            // system-tests to use an isolated configuration file with a
            // pre-loaded logged in user
            .option('configDir', {type: 'string', default: envMap.configDir, hidden: true})
            .option('debug', {type: 'boolean', default: false, describe: 'Flag to show debug logs'})
            .option('silent', {alias: 's', type: 'boolean', default: false, describe: 'Silence all zli messages, only returns command output'})
            .strictCommands() // if unknown command, show help
            .demandCommand(1, '') // if no command, raise failure
            .strict() // any command-line argument given that is not demanded, or does not have a corresponding description, will be reported as an error.
            .help() // auto gen help message
            .version()
            .showHelpOnFail(false)
            .epilog(`Note:
 - <targetString> format: ${targetStringExample}

For command specific help: zli <cmd> help

Command arguments key:
 - <arg> is required
 - [arg] is optional or sometimes required

Need help? https://cloud.bastionzero.com/support`)
            .fail(false);
    }

    public async run(argv: string[], isSystemTest?: boolean, callback?: (err: Error, argv: any, output: string) => void) {
        // @ts-ignore TS2589
        try {
            const { baseCmd, parsedArgv } = makeCaseInsensitive(this.availableCommands, argv);
            await this.getCliDriver(isSystemTest, baseCmd).parseAsync(parsedArgv, {}, callback);
        } catch (err) {
            if (this.logger) {
                if (err) {
                    if (typeof err === 'string') {
                        this.logger.error(err);
                    } else {
                        this.logger.error(err.message);
                        if (err.stack)
                            this.logger.debug(err.stack);
                    }
                }
                await cleanExit(1, this.logger);
            } else {
                if (err) {
                    if (typeof err === 'string') {
                        console.error(err);
                    } else {
                        console.error(err.message);
                    }
                }
                process.exit(1);
            }
        }
    }
}
