import {
    isGuid,
    makeCaseInsensitive,
    parsePolicyType,
    targetStringExample,
    getZliRunCommand,
    targetTypeDisplay
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
import { TargetSummary } from '../webshell-common-ts/http/v2/target/targetSummary.types';
import { KubeClusterSummary } from '../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { EnvironmentSummary } from '../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { version } from '../package.json';
import { BzeroAgentSummary } from '../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { PolicyType } from '../webshell-common-ts/http/v2/policy/types/policy-type.types';

// Handlers
import { initMiddleware, oAuthMiddleware, fetchDataMiddleware, GATrackingMiddleware, initLoggerMiddleware, mixpanelTrackingMiddleware } from './handlers/middleware.handler';
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
import { fetchGroupsHandler } from './handlers/group/fetch-groups.handler';
import { generateBashHandler } from './handlers/generate/generate-bash.handler';
import { quickstartHandler } from './handlers/quickstart/quickstart-handler';
import { describeClusterPolicyHandler } from './handlers/describe-cluster-policy/describe-cluster-policy.handler';
import { quickstartCmdBuilder } from './handlers/quickstart/quickstart.command-builder';
import { defaultTargetGroupHandler } from './handlers/default-target-group/default-target-group.handler';
import { addUserToPolicyHandler } from './handlers/user/add-user-policy.handler';
import { deleteUserFromPolicyHandler } from './handlers/user/delete-user-policy.handler';
import { addGroupToPolicyHandler } from './handlers/group/add-group-policy.handler';
import { deleteGroupFromPolicyHandler } from './handlers/group/delete-group-policy-handler';
import { addTargetUserHandler } from './handlers/target-user/add-target-user.handler';
import { deleteTargetUserHandler } from './handlers/target-user/delete-target-user.handler';
import { listTargetUsersHandler } from './handlers/target-user/list-target-users.handler';
import { addTargetGroupHandler } from './handlers/target-group/add-target-group.handler';
import { deleteTargetGroupHandler } from './handlers/target-group/delete-target-group.handler';
import { listTargetGroupHandler } from './handlers/target-group/list-target-group.handler';
import { listKubernetesPoliciesHandler } from './handlers/policy/list-kubernetes-policies.handler';
import { listTargetConnectPoliciesHandler } from './handlers/policy/list-target-connect-policies.handler';
import { listSessionRecordingPoliciesHandler } from './handlers/policy/list-session-recording-policies.handler';
import { listOrganizationControlsPoliciesHandler } from './handlers/policy/list-organization-controls-policies.handler';
import { generateKubeConfigHandler } from './handlers/generate/generate-kube-config.handler';
import { generateSshConfigHandler } from './handlers/generate/generate-ssh-config.handler';
import { sshProxyConfigHandler } from './handlers/generate/generate-ssh-proxy.handler';
import { listUsersHandler } from './handlers/user/list-users.handler';


// 3rd Party Modules
import yargs from 'yargs/yargs';

// Cmd builders
import { loginCmdBuilder } from './handlers/login/login.command-builder';
import { connectCmdBuilder } from './handlers/connect/connect.command-builder';
import { statusCmdBuilder } from './handlers/status/status.command-builder';
import { policyCmdBuilder } from './handlers/policy/policy.command-builder';
import { describeClusterPolicyCmdBuilder } from './handlers/describe-cluster-policy/describe-cluster-policy.command-builder';
import { disconnectCmdBuilder } from './handlers/disconnect/disconnect.command-builder';
import { attachCmdBuilder } from './handlers/attach/attach.command-builder';
import { closeConnectionCmdBuilder } from './handlers/close-connection/close-connection.command-builder';
import { listTargetsCmdBuilder } from './handlers/list-targets/list-targets.command-builder';
import { listConnectionsCmdBuilder } from './handlers/list-connections/list-connections.command-builder';
import { userCmdBuilder } from './handlers/user/user.command-builder';
import { groupCmdBuilder } from './handlers/group/group.command-builder';
import { targetUserCmdBuilder } from './handlers/target-user/target-user.command-builder';
import { targetGroupCmdBuilder } from './handlers/target-group/target-group.command-builder';
import { sshProxyCmdBuilder } from './handlers/ssh-proxy/ssh-proxy.command-builder';
import { generateKubeConfigCmdBuilder, generateKubeYamlCmdBuilder } from './handlers/generate/generate-kube.command-builder';
import { generateBashCmdBuilder } from './handlers/generate/generate-bash.command-builder';
import { defaultTargetGroupCmdBuilder } from './handlers/default-target-group/default-target-group.command-builder';
import { listProxyPoliciesHandler } from './handlers/policy/list-proxy-policies.handler';
import { UserHttpService } from './http-services/user/user.http-services';
import { generateSshConfigCmdBuilder } from './handlers/generate/generate-ssh-config.command-builder';
import { createApiKeyCmdBuilder } from './handlers/api-key/create-api-key.command-builder';
import { createApiKeyHandler } from './handlers/api-key/create-api-key.handler';
import { deleteTargetsCmdBuilder } from './handlers/delete-targets/delete-targets.command-builder';
import { deleteTargetsHandler } from './handlers/delete-targets/delete-targets.handler';

export type EnvMap = Readonly<{
    configName: string;
    configDir: string;
}>

// Mapping from env vars to options if they exist
export const envMap: EnvMap = {
    'configName'        : process.env.ZLI_CONFIG_NAME           || 'prod',
    'configDir'         : process.env.ZLI_CONFIG_DIR            || undefined
};

export class CliDriver
{
    private configService: ConfigService;
    private keySplittingService: KeySplittingService
    private loggerConfigService: LoggerConfigService;
    private logger: Logger;

    private GAService: GAService;
    private mixpanelService: MixpanelService;

    private ssmTargets: Promise<TargetSummary[]>;
    private dynamicConfigs: Promise<TargetSummary[]>;
    private clusterTargets: Promise<KubeClusterSummary[]>;
    private bzeroTargets: Promise<BzeroAgentSummary[]>;
    private envs: Promise<EnvironmentSummary[]>;

    // use the following to shortcut middleware according to command
    private oauthCommands: Set<string> = new Set([
        'kube',
        'ssh-proxy-config',
        'connect',
        'user',
        'targetuser',
        'targetgroup',
        'describe-cluster-policy',
        'disconnect',
        'attach',
        'close',
        'list-targets',
        'lt',
        'list-connections',
        'lc',
        'ssh-proxy',
        'policy',
        'group',
        'generate-bash',
        'register',
        'generate',
        'api-key',
        'delete-targets'
    ]);

    private GACommands: Set<string> = new Set([
        'kube',
        'ssh-proxy-config',
        'connect',
        'user',
        'targetuser',
        'targetgroup',
        'describe-cluster-policy',
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
        'group',
        'generate-bash'
    ]);

    private fetchCommands: Set<string> = new Set([
        'user',
        'targetuser',
        'targetgroup',
        'describe-cluster-policy',
        'generate',
        'policy',
        'group',
        'generate-bash'
    ]);

    private adminOnlyCommands: Set<string> = new Set([
        'group',
        'user',
        'targetuser',
        'targetgroup',
        'policy',
        'describe-cluster-policy',
        'generate-bash',
        'api-key',
        'delete-targets'
    ]);

    // available options for TargetType autogenerated from enum
    private targetTypeChoices: string[] = Object.values(TargetType).map(tt => targetTypeDisplay(tt).toLowerCase());
    private targetStatusChoices: string[] = Object.keys(TargetStatus).map(s => s.toLowerCase());

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
            .middleware(() => {
                if(!this.fetchCommands.has(baseCmd))
                    return;
                const fetchDataResponse = fetchDataMiddleware(this.configService, this.logger);
                this.dynamicConfigs = fetchDataResponse.dynamicConfigs;
                this.clusterTargets = fetchDataResponse.clusterTargets;
                this.ssmTargets = fetchDataResponse.ssmTargets;
                this.bzeroTargets = fetchDataResponse.bzeroTargets;
                this.envs = fetchDataResponse.envs;
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
                            async (argv) => await generateBashHandler(argv, this.logger, this.configService, this.envs),
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
                            async (argv) => await generateKubeYamlHandler(argv, this.envs, this.configService, this.logger)
                        )
                        .demandCommand(1, '')
                        .strict();
                },
            )
            .command(
                ['policy [type]'],
                'List the available policies',
                (yargs) => {
                    return policyCmdBuilder(yargs, this.policyTypeChoices);
                },
                async (argv) => {
                    // If provided type filter, apply it
                    let policyType: PolicyType = undefined;
                    if(!! argv.type) {
                        policyType = parsePolicyType(argv.type);
                    }

                    switch (policyType) {
                    case PolicyType.TargetConnect:
                        await listTargetConnectPoliciesHandler(argv, this.configService, this.logger, this.ssmTargets, this.dynamicConfigs, this.envs);
                        break;
                    case PolicyType.Kubernetes:
                        await listKubernetesPoliciesHandler(argv, this.configService, this.logger, this.clusterTargets, this.envs);
                        break;
                    case PolicyType.SessionRecording:
                        await listSessionRecordingPoliciesHandler(argv, this.configService, this.logger);
                        break;
                    case PolicyType.Proxy:
                        await listProxyPoliciesHandler(argv, this.configService, this.logger, this.envs);
                        break;
                    case PolicyType.OrganizationControls:
                        await listOrganizationControlsPoliciesHandler(argv, this.configService, this.logger);
                        break;
                    default:
                        await listTargetConnectPoliciesHandler(argv, this.configService, this.logger, this.ssmTargets, this.dynamicConfigs, this.envs);
                        await listKubernetesPoliciesHandler(argv, this.configService, this.logger, this.clusterTargets, this.envs);
                        await listSessionRecordingPoliciesHandler(argv, this.configService, this.logger);
                        await listProxyPoliciesHandler(argv, this.configService, this.logger, this.envs);
                        await listOrganizationControlsPoliciesHandler(argv, this.configService, this.logger);
                        break;
                    }
                    await cleanExit(0, this.logger);
                }
            )
            .command(
                'describe-cluster-policy <clusterName>',
                'Get detailed information about what policies apply to a certain cluster',
                (yargs) => {
                    return describeClusterPolicyCmdBuilder(yargs);
                },
                async (argv) => {
                    await describeClusterPolicyHandler(argv.clusterName, this.configService, this.logger, this.clusterTargets);
                }
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
                ['user [policyName] [idpEmail]'],
                'List the available users, add them, or remove them from policies',
                (yargs) => {
                    return userCmdBuilder(yargs);
                },
                async (argv) => {
                    if (!! argv.add) {
                        await addUserToPolicyHandler(argv.idpEmail, argv.policyName, this.configService, this.logger);
                    } else if (!! argv.delete) {
                        await deleteUserFromPolicyHandler(argv.idpEmail, argv.policyName, this.configService, this.logger);
                    } else if (!(!!argv.add && !!argv.delete)) {
                        await listUsersHandler(argv, this.configService, this.logger);
                    } else {
                        this.logger.error(`Invalid flags combination. Please see help.`);
                        await cleanExit(1, this.logger);
                    }
                }
            )
            .command(
                ['group [policyName] [groupName]'],
                'List the available identity provider groups, add them, or remove them from policies',
                (yargs) => {
                    return groupCmdBuilder(yargs);
                },
                async (argv) => {
                    if (!! argv.add) {
                        await addGroupToPolicyHandler(argv.groupName, argv.policyName, this.configService, this.logger);
                    } else if (!! argv.delete) {
                        await deleteGroupFromPolicyHandler(argv.groupName, argv.policyName, this.configService, this.logger);
                    } else if (!(!!argv.add && !!argv.delete)) {
                        await fetchGroupsHandler(argv, this.configService, this.logger);
                    } else {
                        this.logger.error(`Invalid flags combination. Please see help.`);
                        await cleanExit(1, this.logger);
                    }
                }
            )
            .command(
                ['targetuser <policyName> [user]'],
                'List the available targetUsers, add them, or remove them from policies',
                (yargs) => {
                    return targetUserCmdBuilder(yargs);
                },
                async (argv) => {
                    if (!! argv.add) {
                        await addTargetUserHandler(argv.user, argv.policyName, this.configService, this.logger);
                    } else if (!! argv.delete) {
                        await deleteTargetUserHandler(argv.user, argv.policyName, this.configService, this.logger);
                    } else if (!(!!argv.add && !!argv.delete)) {
                        await listTargetUsersHandler(this.configService, this.logger, argv, argv.policyName);
                    } else {
                        this.logger.error(`Invalid flags combination. Please see help.`);
                        await cleanExit(1, this.logger);
                    }
                }
            )
            .command(
                ['targetgroup <policyName> [group]'],
                'List the available targetGroups, add them, or remove them from policies',
                (yargs) => {
                    return targetGroupCmdBuilder(yargs);
                },
                async (argv) => {
                    if (!! argv.add) {
                        await addTargetGroupHandler(argv.group, argv.policyName, this.configService, this.logger);
                    }
                    else if (!!argv.delete) {
                        await deleteTargetGroupHandler(argv.group, argv.policyName, this.configService, this.logger);
                    } else if (!(!!argv.add && !!argv.delete)) {
                        await listTargetGroupHandler(this.configService, this.logger, argv, argv.policyName);
                    } else {
                        this.logger.error(`Invalid flags combination. Please see help.`);
                        await cleanExit(1, this.logger);
                    }
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
                'generate-bash',
                'Returns a bash script to autodiscover a target.',
                (yargs) => {
                    return generateBashCmdBuilder(yargs) ;
                },
                async (argv) => {
                    await generateBashHandler(argv, this.logger, this.configService, this.envs);
                    this.logger.warn('The generate-bash command is deprecated and will be removed soon, please use its equivalent \'zli generate bash\'');
                },
                [],
                true // deprecated = true
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
            .command(
                'delete-targets <environmentName>',
                false,
                (yargs) => {
                    return deleteTargetsCmdBuilder(yargs);
                },
                async (argv) => {
                    await deleteTargetsHandler(this.configService, this.logger, argv.environmentName);
                }
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
            .showHelpOnFail(false)
            .epilog(`Note:
 - <targetString> format: ${targetStringExample}

For command specific help: zli <cmd> help

Command arguments key:
 - <arg> is required
 - [arg] is optional or sometimes required

Need help? https://cloud.bastionzero.com/support`)
            .fail(isSystemTest ? false : (msg: string, err : string | Error, yargs) => {
                if (this.logger) {
                    if (msg) {
                        this.logger.error(msg);
                    }
                    if (err) {
                        if (typeof err === 'string') {
                            this.logger.error(err);
                        } else {
                            this.logger.error(err.message);
                            if (err.stack)
                                this.logger.debug(err.stack);
                        }
                    }
                } else {
                    if (msg) {
                        console.error(msg);
                    }
                    if (err) {
                        if (typeof err === 'string') {
                            console.error(err);
                        } else {
                            console.error(err.message);
                        }
                    }
                }

                // If there are no args passed, show help screen
                if (process.argv.slice(2).length == 0){
                    yargs.showHelp();
                }

                process.exit(1);
            });
    }

    public run(argv: string[], isSystemTest?: boolean, callback?: (err: Error, argv: any, output: string) => void) {
        // @ts-ignore TS2589
        const { baseCmd, parsedArgv } = makeCaseInsensitive(argv);
        return this.getCliDriver(isSystemTest, baseCmd).parseAsync(parsedArgv, {}, callback);
    }
}
