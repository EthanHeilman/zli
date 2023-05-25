import Table from 'cli-table3';
import fs from 'fs';
import util from 'util';
import humanizeDuration from 'humanize-duration';
import { includes, map, max } from 'lodash';
import { IdentityProvider } from 'webshell-common-ts/auth-service/auth.types';
import { cleanExit } from 'handlers/clean-exit.handler';
import { ParsedTargetString } from 'services/common.types';
import { TargetSummary } from 'webshell-common-ts/http/v2/target/targetSummary.types';
import { Logger } from 'services/logger/logger.service';
import { TargetType, toTargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';
import { EnvironmentSummary } from 'webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { UserSummary } from 'webshell-common-ts/http/v2/user/types/user-summary.types';
import { KubernetesPolicySummary } from 'webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { TargetConnectPolicySummary } from 'webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { OrganizationControlsPolicySummary } from 'webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { SessionRecordingPolicySummary } from 'webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { PolicyType } from 'webshell-common-ts/http/v2/policy/types/policy-type.types';
import { SubjectType } from 'webshell-common-ts/http/v2/common.types/subject.types';
import { VerbType } from 'webshell-common-ts/http/v2/policy/types/verb-type.types';
import { GroupSummary } from 'webshell-common-ts/http/v2/organization/types/group-summary.types';
import { SsmTargetSummary } from 'webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { DynamicAccessConfigSummary } from 'webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-summary.types';
import { ProxyPolicySummary } from 'webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { Group } from 'webshell-common-ts/http/v2/policy/types/group.types';
import { BzeroAgentSummary } from 'webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { DynamicAccessConfigStatus } from 'webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-status.types';
import { CaseInsensitiveArgv } from 'utils/types/case-insensitive-argv';
import { JustInTimePolicySummary } from 'webshell-common-ts/http/v2/policy/just-in-time/types/just-in-time-policy-summary.types';
import { DbTargetSummary } from 'webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { DbConfig, KubeConfig, WebConfig } from 'services/config/config.service.types';
import { ServiceAccountSummary } from 'webshell-common-ts/http/v2/service-account/types/service-account-summary.types';
import { ServiceAccountBzeroCredentials } from 'handlers/login/types/service-account-bzero-credentials.types';
import { baseCreatePolicyCmdBuilderArgs } from 'handlers/policy/policy-create/create-policy.command-builder';
import { SubjectRole } from 'webshell-common-ts/http/v2/subject/types/subject-role.types';
import { AuthorizedGithubActionSummary } from 'webshell-common-ts/http/v2/authorized-github-action/types/authorized-github-action-summary.types';

// case insensitive substring search, 'find targetString in searchString'
export function isSubstring(targetString: string, searchString: string) : boolean
{
    return searchString.toLowerCase().indexOf(targetString.toLowerCase()) !== -1;
}

export function makeCaseInsensitive(zliCommands: Set<string>, argv: string[]) : CaseInsensitiveArgv
{
    const caseInsensitiveArgv: CaseInsensitiveArgv = {
        baseCmd: '',
        parsedArgv: []
    };
    caseInsensitiveArgv.parsedArgv = [];
    argv.forEach(arg => {
        // If the argument is a command and a command has not been specified already
        if(zliCommands.has(arg.toLowerCase()) && caseInsensitiveArgv.baseCmd === '') {
            const baseCmd = arg.toLowerCase();
            caseInsensitiveArgv.baseCmd = baseCmd;
            caseInsensitiveArgv.parsedArgv.push(baseCmd);
        }
        else
            caseInsensitiveArgv.parsedArgv.push(arg);
    });
    return caseInsensitiveArgv;
}

export const targetStringExample : string = '[targetUser@]<targetId-or-targetName>';

export function parseTargetType(targetType: string) : TargetType
{
    if(! targetType) return undefined;

    switch (targetType.toLowerCase()) {
    case targetTypeDisplay(TargetType.SsmTarget).toLowerCase():
        return TargetType.SsmTarget;
    case targetTypeDisplay(TargetType.DynamicAccessConfig).toLowerCase():
        return TargetType.DynamicAccessConfig;
    case targetTypeDisplay(TargetType.Kubernetes).toLowerCase():
        return TargetType.Kubernetes;
    case targetTypeDisplay(TargetType.Linux).toLowerCase():
        return TargetType.Linux;
    case targetTypeDisplay(TargetType.Windows).toLowerCase():
        return TargetType.Windows;
    case targetTypeDisplay(TargetType.Db).toLowerCase():
        return TargetType.Db;
    case targetTypeDisplay(TargetType.Web).toLowerCase():
        return TargetType.Web;
    default:
        return undefined;
    }
}

export function parseVerbType(verb: string) : VerbType
{
    if(!verb) return undefined;

    // Verbs are checked to be these three cases by yargs
    switch(verb.toLowerCase()){
    case verbTypeDisplay(VerbType.Shell).toLowerCase():
        return VerbType.Shell;
    case verbTypeDisplay(VerbType.FileTransfer).toLowerCase():
        return VerbType.FileTransfer;
    case verbTypeDisplay(VerbType.Tunnel).toLowerCase():
        return VerbType.Tunnel;
    default:
        return undefined;
    }
}

export function parseSubjectRole(role: string) : SubjectRole
{
    if(!role) return undefined;

    // Verbs are checked to be these three cases by yargs
    switch(role.toLowerCase()){
    case subjectRoleDisplay(SubjectRole.Admin).toLowerCase():
        return SubjectRole.Admin;
    case subjectRoleDisplay(SubjectRole.User).toLowerCase():
        return SubjectRole.User;
    default:
        return undefined;
    }
}

export function parsePolicyType(policyType: string) : PolicyType
{
    const policyTypePattern = /^(targetconnect|organizationcontrols|sessionrecording|kubernetes|proxy|justintime)$/i; // case insensitive check for policyType

    if(! policyTypePattern.test(policyType))
        return undefined;

    switch (policyType.toLowerCase()) {
    case PolicyType.Kubernetes.toLowerCase():
        return PolicyType.Kubernetes;
    case PolicyType.OrganizationControls.toLowerCase():
        return PolicyType.OrganizationControls;
    case PolicyType.SessionRecording.toLowerCase():
        return PolicyType.SessionRecording;
    case PolicyType.TargetConnect.toLowerCase():
        return PolicyType.TargetConnect;
    case PolicyType.Proxy.toLowerCase():
        return PolicyType.Proxy;
    case PolicyType.JustInTime.toLowerCase():
        return PolicyType.JustInTime;
    default:
        return undefined;
    }
}

export function parseIdpType(idp: IdentityProvider) : IdentityProvider
{
    switch (idp) {
    case IdentityProvider.Google:
        return IdentityProvider.Google;
    case IdentityProvider.Microsoft:
        return IdentityProvider.Microsoft;
    case IdentityProvider.Okta:
        return IdentityProvider.Okta;
    case IdentityProvider.OneLogin:
        return IdentityProvider.OneLogin;
    case IdentityProvider.Keycloak:
        return IdentityProvider.Keycloak;
    default:
        return undefined;
    }
}

export function parseTargetStatus(targetStatus: string) : TargetStatus {
    switch (targetStatus.toLowerCase()) {
    case TargetStatus.NotActivated.toLowerCase():
        return TargetStatus.NotActivated;
    case TargetStatus.Offline.toLowerCase():
        return TargetStatus.Offline;
    case TargetStatus.Online.toLowerCase():
        return TargetStatus.Online;
    case TargetStatus.Terminated.toLowerCase():
        return TargetStatus.Terminated;
    case TargetStatus.Error.toLowerCase():
        return TargetStatus.Error;
    case TargetStatus.Restarting.toLowerCase():
        return TargetStatus.Restarting;
    default:
        return undefined;
    }
}

export function parseTargetString(targetString: string) : ParsedTargetString
{
    // case sensitive check for [targetUser@]<targetId | targetName>[:targetPath]
    // const pattern = /^([a-z_]([a-z0-9_-]{0,31}|[a-z0-9_-]{0,30}\$)@)?(([0-9A-Fa-f]{8}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{12})|([a-zA-Z0-9_.-]{1,255}))(:{1}|$)/;

    const result : ParsedTargetString = {
        type: undefined,
        user: undefined,
        id: undefined,
        name: undefined,
        envId: undefined,
        envName: undefined
    };

    const userTargetSeparator = targetString.lastIndexOf('@');

    // Extract the target role user if one is provided. Since target role users
    //  can contain `@` the targetString might contain two `@` we use the last
    //  `@` as the seperator. For instance not the two @ in the following
    //  targetString:
    //  aliceservacc@ethandbtest.iam.gserviceaccount.com@gcp-psql
    //
    //  aliceservacc@ethandbtest.iam.gserviceaccount.com
    //  - is the GCP posgreSQL username
    //
    //  gcp-psql - is the bastionzero target alias
    if (userTargetSeparator != -1)
    {
        result.user = targetString.slice(0, userTargetSeparator);
        targetString = targetString.slice(userTargetSeparator+1);
    }
    const targetNamePattern = /^(([0-9A-Fa-f]{8}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{12})|([a-zA-Z0-9_.-]{1,255}))(:{1}|$)/;
    if(! targetNamePattern.test(targetString)) {
        return undefined;
    }

    // extract the environment id or name
    // split only on the first period
    // everything before is the targetName and everything after is the environment
    const firstSeparatorIndex = targetString.indexOf('.');
    let targetIdOrName = '';
    let environmentIdOrName = '';
    if(firstSeparatorIndex >= 0) {
        targetIdOrName = targetString.slice(0, firstSeparatorIndex);
        environmentIdOrName = targetString.slice(firstSeparatorIndex + 1);
    } else {
        targetIdOrName = targetString;
    }

    // test if targetSomething is GUID
    if(isGuid(targetIdOrName))
        result.id = targetIdOrName;
    else
        result.name = targetIdOrName;

    // test if environmenIdOrName is GUID
    if(isGuid(environmentIdOrName))
        result.envId = environmentIdOrName;
    else if(environmentIdOrName !== '')
        result.envName = environmentIdOrName;

    return result;
}

// Checks whether the passed argument is a valid Guid
export function isGuid(id: string): boolean{
    const guidPattern = /^[0-9A-Fa-f]{8}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{12}$/;
    return guidPattern.test(id);
}

export function targetTypeDisplay(type: TargetType) : string {
    switch(type) {
    case TargetType.Bzero:
        return 'Bzero';
    case TargetType.SsmTarget:
        return 'SSM';
    case TargetType.DynamicAccessConfig:
        return 'Dynamic';
    case TargetType.Cluster:
    case TargetType.Kubernetes:
        return 'Kubernetes';
    case TargetType.Linux:
        return 'Linux';
    case TargetType.Windows:
        return 'Windows';
    case TargetType.Web:
        return 'Web';
    case TargetType.Db:
        return 'Db';
    default:
        const _exhaustiveCheck: never = type;
        return _exhaustiveCheck;
    }
}

export function verbTypeDisplay(type: VerbType) : string {
    switch(type) {
    case VerbType.Shell:
        return 'Shell';
    case VerbType.FileTransfer:
        return 'FileTransfer';
    case VerbType.Tunnel:
        return 'Tunnel';
    case VerbType.RDP:
        return 'RDP';
    default:
        const _exhaustiveCheck: never = type;
        return _exhaustiveCheck;
    }
}

export function subjectRoleDisplay(role: SubjectRole) : string {
    switch(role) {
    case SubjectRole.Admin:
        return 'admin';
    case SubjectRole.User:
        return 'user';
    default:
        const _exhaustiveCheck: never = role;
        return _exhaustiveCheck;
    }
}

export function getTableOfTargets(targets: TargetSummary[], envs: EnvironmentSummary[], showDetail: boolean = false, showGuid: boolean = false) : string
{
    // The following constant numbers are set specifically to conform with the specified 80/132 cols term size - do not change
    const targetNameLength = max(targets.map(t => t.name.length)) + 2 || 16; // || 16 here means that when there are no targets default the length to 16
    const envNameLength = max([max(envs.map(e => e.name.length)) + 2, 16]);
    const targetTypeLength = max([max(targets.map(t => targetTypeDisplay(t.type).length)) + 2, 6]);

    const header: string[] = ['Type', 'Name', 'Environment'];
    const columnWidths = [];
    if (!showDetail) {
        columnWidths.push(targetTypeLength);
        columnWidths.push(targetNameLength > 44 ? 44 : targetNameLength);
        columnWidths.push(envNameLength > 47 ? 47 : envNameLength);
    } else {
        columnWidths.push(targetTypeLength);
        columnWidths.push(targetNameLength > 32 ? 32 : targetNameLength);
        columnWidths.push(envNameLength > 31 ? 31 : envNameLength);
    }

    if(showGuid)
    {
        header.push('Id');
        columnWidths.push(38);
    }

    if(showDetail)
    {
        header.push('Agent Version', 'Status', 'Target Users', 'Region');
        columnWidths.push(15, 9, 29, 18);
    }

    // ref: https://github.com/cli-table/cli-table3
    const table = new Table({ head: header, colWidths: columnWidths });

    targets.forEach(target => {
        let env = target.environmentId;
        if (env != 'N/A') {
            env = envs.filter(e => e.id == target.environmentId).pop().name;
        }

        const row = [targetTypeDisplay(target.type), target.name, env];

        if(showGuid) {
            row.push(target.id);
        }

        if(showDetail) {
            row.push(target.agentVersion);
            row.push(target.status || 'N/A'); // status is undefined for non-SSM targets
            row.push(map(target.targetUsers).join(', \n') || 'N/A');
            row.push(target.region);
        }

        table.push(row);
    }
    );

    return table.toString();
}

export function createTableWithWordWrap(header: string[], rows: string[][]) : string {
    const table = new Table({
        head: header,
        wordWrap: true,
        wrapOnWordBoundary: true,
    });

    table.push(...rows);
    return table.toString();
}

export function getTableOfUsers(users: UserSummary[]) : string
{
    const nameLength = max(users.map(u => u.fullName.length).concat(16));
    const emailLength = max(users.map(u => u.email.length).concat(36));
    const header: string[] = ['Name', 'Email', 'Role', 'Last Login'];
    const columnWidths = [nameLength + 2, emailLength + 2, 7, 20];

    const table = new Table({ head: header, colWidths: columnWidths });
    const dateOptions = {year: '2-digit', month: 'numeric', day: 'numeric', hour:'numeric', minute:'numeric', hour12: true};
    users.forEach(u => {
        const row = [u.fullName, u.email, u.isAdmin ? 'Admin' : 'User', u.lastLogin ? u.lastLogin.toLocaleString('en-US', dateOptions as any) : 'N/A'];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfServiceAccounts(serviceAccounts: ServiceAccountSummary[], showDetail: boolean = false) : string
{
    const emailLength = max(serviceAccounts.map(u => u.email.length).concat(36));
    const header: string[] = ['Email', 'Role', 'Last Login'];
    const columnWidths = [emailLength + 2, 7, 20];
    const jwksUrlColumnWidth = 29;
    const jwksUrlPatternColumnWidth = 29;

    if(showDetail)
    {
        header.push('External ID', 'JWKS URL', 'JWKS URL Pattern', 'Enabled');
        columnWidths.push(25, jwksUrlColumnWidth, jwksUrlPatternColumnWidth, 9);
    }

    const table = new Table({ head: header, colWidths: columnWidths });
    const dateOptions = {year: '2-digit', month: 'numeric', day: 'numeric', hour:'numeric', minute:'numeric', hour12: true};
    serviceAccounts.forEach(sa => {
        const row = [sa.email, sa.isAdmin ? 'Admin' : 'User', sa.lastLogin ? sa.lastLogin.toLocaleString('en-US', dateOptions as any) : 'N/A'];
        if(showDetail) {
            row.push(sa.externalId);
            row.push(getReadableMultiLineString(sa.jwksUrl, jwksUrlColumnWidth));
            row.push(getReadableMultiLineString(sa.jwksUrlPattern, jwksUrlPatternColumnWidth));
            row.push(String(sa.enabled));
        }
        table.push(row);
    });

    return table.toString();
}

export function getTableOfAuthorizedGithubActions(authorizedGithubActions: AuthorizedGithubActionSummary[], userMap: {[id: string]: UserSummary}) : string
{
    const actionIdLength = max(authorizedGithubActions.map(a => a.githubActionId.length).concat(36));
    const header: string[] = ['Github Action ID', 'Created By', 'Time Created'];
    const columnWidths = [actionIdLength + 2, 29, 19];

    const table = new Table({ head: header, colWidths: columnWidths });
    const dateOptions = {year: '2-digit', month: 'numeric', day: 'numeric', hour:'numeric', minute:'numeric', hour12: true};
    authorizedGithubActions.forEach(a => {
        const row = [a.githubActionId, getUserName(a.createdBy, userMap), a.timeCreated.toLocaleString('en-US', dateOptions as any)];
        table.push(row);
    });

    return table.toString();
}

function getReadableMultiLineString(value: string, columnWidth: number): string {
    let readableMultiLineString = '';
    let remainingValueLength = value.length;
    let currentValueIndex = 0;
    const realColumnWidth = columnWidth - 2;
    while(remainingValueLength > realColumnWidth) {
        readableMultiLineString += (value.substring(currentValueIndex, currentValueIndex+realColumnWidth) + '\n');
        currentValueIndex += realColumnWidth;
        remainingValueLength -= realColumnWidth;
    }
    readableMultiLineString += (value.substring(currentValueIndex, currentValueIndex+realColumnWidth));
    return readableMultiLineString;
}

export function getTableOfGroups(groups: GroupSummary[]) : string
{
    const nameLength = max(groups.map(g => g.name.length).concat(16));
    const header: string[] = ['Group Name'];
    const columnWidths = [nameLength + 2];

    const table = new Table({ head: header, colWidths: columnWidths });
    groups.forEach(g => {
        const row = [g.name];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfTargetUsers(targetUsers: string[]): string {
    return getTableOfTargetObject(targetUsers, 'Allowed Target Users');
}

export function getTableOfTargetGroups(targetUsers: string[]): string {
    return getTableOfTargetObject(targetUsers, 'Allowed Target Groups');
}

export function getTableOfTargetObject(targetUsers: string[], headerString: string) : string
{
    const header: string[] = [headerString];
    const nameLength = max(targetUsers.map(u => u.length).concat(16));
    // If the title's length is bigger than the longer user use that as the row length
    const rowLength = nameLength > header[0].length ? nameLength : header[0].length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: header, colWidths: columnWidths });
    targetUsers.forEach(u => {
        const row = [u];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfKubeStatus(kubeConfig: KubeConfig) : string
{
    const title: string = 'Kube Daemon Running';
    const values = [`Target Cluster: ${kubeConfig['targetCluster']}`, `Target User: ${kubeConfig['targetUser']}`, `Target Group: ${kubeConfig['targetGroups'].join(',')}`, `Local URL: ${kubeConfig['localHost']}:${kubeConfig['localPort']}`];

    const valuesLength = max(values.map(s => s.length).concat(16));

    // If the title's length is bigger than the longer user use that as the row length (0 index is the longest header)
    const rowLength = valuesLength > title.length ? valuesLength : title.length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: [title], colWidths: columnWidths });
    values.forEach( value => {
        table.push([value]);
    });

    return table.toString();
}

export function getTableOfWebStatus(webConfig: WebConfig) : string
{
    const title: string = 'Web Daemon Running';
    const values = [`Target Name: ${webConfig['name']}`, `Local URL: ${webConfig['localHost']}:${webConfig['localPort']}`];

    const valuesLength = max(values.map(s => s.length).concat(16));

    // If the title's length is bigger than the longer user use that as the row length (0 index is the longest header)
    const rowLength = valuesLength > title.length ? valuesLength : title.length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: [title], colWidths: columnWidths });
    values.forEach( value => {
        table.push([value]);
    });

    return table.toString();
}

export function getTableOfDbStatus(dbConfig: DbConfig) : string
{
    const title: string = 'Db Daemon Running';
    const values = [`Target Name: ${dbConfig['name']}`, `Local URL: ${dbConfig['localHost']}:${dbConfig['localPort']}`];

    const valuesLength = max(values.map(s => s.length).concat(16));

    // If the title's length is bigger than the longer user use that as the row length (0 index is the longest header)
    const rowLength = valuesLength > title.length ? valuesLength : title.length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: [title], colWidths: columnWidths });
    values.forEach( value => {
        table.push([value]);
    });

    return table.toString();
}

export function getTableOfDescribeCluster(kubernetesPolicies: KubernetesPolicySummary[]) : string {
    const header: string[] = ['Policy', 'Target Users', 'Target Group'];

    const policyLength = max(kubernetesPolicies.map(p => p.name.length).concat(16));
    const targetUserLength = max(kubernetesPolicies.map(p => p.clusterUsers.length).concat(16));
    const targetGroupLength = max(kubernetesPolicies.map(p => p.clusterGroups.length).concat(16));

    const columnWidths = [policyLength + 2, targetUserLength + 4, targetGroupLength + 4];


    const table = new Table({ head: header, colWidths: columnWidths });
    kubernetesPolicies.forEach(p => {
        const formattedTargetUsers = p.clusterUsers.map((u: any) => u.name).join(', \n');
        const formattedTargetGroups = p.clusterGroups.map((g: any) => g.name).join(', \n');
        const row = [p.name, formattedTargetUsers, formattedTargetGroups];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfKubernetesPolicies(
    kubernetesPolicies: KubernetesPolicySummary[],
    userMap: {[id: string]: UserSummary},
    environmentMap: {[id: string]: EnvironmentSummary},
    targetMap : {[id: string]: string},
    groupMap : {[id: string]: GroupSummary},
    serviceAccountMap : {[id: string]: ServiceAccountSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    kubernetesPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach((group: any) => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.User:
                subjectNames.push(getReadableMultiLineString(getUserName(subject.id, userMap), 26));
                break;
            case SubjectType.ServiceAccount:
                subjectNames.push(getReadableMultiLineString(getServiceAccountName(subject.id, serviceAccountMap), 26));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        // Translate the resource ids to human readable resources
        let formattedResource = '';
        let formattedTargetUsers = '';
        let formattedTargetGroup = '';

        if (p.environments && p.environments.length != 0) {
            const environmentNames : string [] = [];
            p.environments.forEach(
                (env: any) => environmentNames.push(getEnvironmentName(env.id, environmentMap))
            );
            formattedResource = 'Environments: ' + environmentNames.join( ', \n');
        } else if (p.clusters && p.clusters.length != 0) { // Alternatively if this policy gets applied straight on some clusters
            const clusterNames : string [] = [];
            p.clusters.forEach(
                (c: any) => clusterNames.push(getTargetName(c.id, targetMap))
            );
            formattedResource = 'Clusters: ' + clusterNames.join( ', \n');
        } else {
            throw new Error('Malformed policy!');
        }

        if (p.clusterUsers) {
            const clusterUsersNames : string [] = [];
            p.clusterUsers.forEach(
                (cu: any) => clusterUsersNames.push(cu.name)
            );
            formattedTargetUsers = 'Cluster Users: ' + clusterUsersNames.join(', \n');
        }

        if (p.clusterGroups) {
            const clusterGroupsName: string[] = [];
            p.clusterGroups.forEach(
                (cg: any) => clusterGroupsName.push(cg.name)
            );
            formattedTargetGroup = 'Cluster Groups: ' + clusterGroupsName.join(', \n');
        }

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            formattedResource || 'N/A',
            formattedTargetUsers || 'N/A',
            formattedTargetGroup || 'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfTargetConnectPolicies(
    targetConnectPolicies: TargetConnectPolicySummary[],
    userMap: {[id: string]: UserSummary},
    environmentMap: {[id: string]: EnvironmentSummary},
    targetMap : {[id: string]: string},
    groupMap : {[id: string]: GroupSummary},
    serviceAccountMap : {[id: string]: ServiceAccountSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    targetConnectPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.User:
                subjectNames.push(getReadableMultiLineString(getUserName(subject.id, userMap), 26));
                break;
            case SubjectType.ServiceAccount:
                subjectNames.push(getReadableMultiLineString(getServiceAccountName(subject.id, serviceAccountMap), 26));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        // Translate the resource ids to human readable resources
        let formattedResource = '';
        let formattedTargetUsers = '';
        const formattedTargetGroup = '';
        if (p.environments && p.environments.length != 0) {
            const environmentNames : string [] = [];
            p.environments.forEach(
                env => environmentNames.push(getEnvironmentName(env.id, environmentMap))
            );
            formattedResource = 'Environments: ' + environmentNames.join( ', \n');
        } else if (p.targets && p.targets.length != 0) { // Alternatively if this policy gets applied straight on some targets
            const targetNames : string [] = [];
            p.targets.forEach(
                t => targetNames.push(getTargetName(t.id, targetMap))
            );
            formattedResource = 'Targets: ' + targetNames.join( ', \n');
        } else {
            throw new Error('Malformed policy!');
        }

        if (p.targetUsers) {
            const targetUsersNames : string [] = [];
            p.targetUsers.forEach(
                tu => targetUsersNames.push(tu.userName)
            );
            formattedTargetUsers = 'Unix Users: ' + targetUsersNames.join(', \n');
        }

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            formattedResource || 'N/A',
            formattedTargetUsers || 'N/A',
            formattedTargetGroup || 'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfJustInTimePolicies(
    justInTimePolicies: JustInTimePolicySummary[],
    userMap: {[id: string]: UserSummary},
    groupMap : {[id: string]: GroupSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Automatically Approved', 'Duration'];
    const columnWidths = [24, 19, 26, 36, 25, 25];

    const table = new Table({ head: header, colWidths: columnWidths });
    justInTimePolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        // Translate the resource ids to human readable resources
        let formattedResource = '';
        if (p.childPolicies && p.childPolicies.length != 0) {
            const childPoliciesNames : string [] = [];
            p.childPolicies.forEach(
                cp => childPoliciesNames.push(cp.name)
            );
            formattedResource = 'Child Policies:\n' + childPoliciesNames.join( ', \n');
        }

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            formattedResource || 'N/A',
            p.automaticallyApproved,
            humanizeDuration(p.duration * 60 * 1000)
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfOrganizationControlPolicies(
    organizationControlsPolicies: OrganizationControlsPolicySummary[],
    userMap: {[id: string]: UserSummary},
    groupMap : {[id: string]: GroupSummary},
    serviceAccountMap : {[id: string]: ServiceAccountSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    organizationControlsPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.User:
                subjectNames.push(getReadableMultiLineString(getUserName(subject.id, userMap), 26));
                break;
            case SubjectType.ServiceAccount:
                subjectNames.push(getReadableMultiLineString(getServiceAccountName(subject.id, serviceAccountMap), 26));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            'N/A',
            'N/A',
            'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfProxyPolicies(
    proxyPolicies: ProxyPolicySummary[],
    userMap: {[id: string]: UserSummary},
    environmentMap: {[id: string]: EnvironmentSummary},
    targetMap : {[id: string]: string},
    groupMap : {[id: string]: GroupSummary},
    serviceAccountMap : {[id: string]: ServiceAccountSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users'];
    const columnWidths = [24, 19, 26, 28, 28];

    const table = new Table({ head: header, colWidths: columnWidths });
    proxyPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach((group: Group) => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.User:
                subjectNames.push(getReadableMultiLineString(getUserName(subject.id, userMap), 26));
                break;
            case SubjectType.ServiceAccount:
                subjectNames.push(getReadableMultiLineString(getServiceAccountName(subject.id, serviceAccountMap), 26));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        const formattedTargetUsers = `Users: ${p.targetUsers?.map(u => u.userName).join(',\n')}`;

        // Translate the resource ids to human readable resources
        let formattedResource = '';

        if (p.environments && p.environments.length != 0) {
            const environmentNames : string [] = [];
            p.environments.forEach(
                env => environmentNames.push(getEnvironmentName(env.id, environmentMap))
            );
            formattedResource = 'Environments: ' + environmentNames.join( ', \n');
        } else if (p.targets && p.targets.length != 0) { // Alternatively if this policy gets applied straight on some targets
            const targetNames : string [] = [];
            p.targets.forEach(
                t => targetNames.push(getTargetName(t.id, targetMap))
            );
            formattedResource = 'Targets: ' + targetNames.join( ', \n');
        } else {
            throw new Error('Malformed policy!');
        }

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            formattedResource || 'N/A',
            formattedTargetUsers || 'N/A',
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfSessionRecordingPolicies(
    sessionRecordingPolicies: SessionRecordingPolicySummary[],
    userMap: {[id: string]: UserSummary},
    groupMap : {[id: string]: GroupSummary},
    serviceAccountMap : {[id: string]: ServiceAccountSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    sessionRecordingPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            case SubjectType.ServiceAccount:
                subjectNames.push(getServiceAccountName(subject.id, serviceAccountMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            'N/A',
            'N/A',
            'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

function getUserName(userId: string, userMap: {[id: string]: UserSummary}) : string {
    return userMap[userId]
        ? userMap[userId].email
        : 'USER DELETED';
}

function getServiceAccountName(subjectId: string, serviceAccountMap: {[id: string]: ServiceAccountSummary}) : string {
    return serviceAccountMap[subjectId]
        ? serviceAccountMap[subjectId].email
        : 'SERVICE ACCOUNT DISABLED';
}

function getEnvironmentName(envId: string, environmentMap: {[id: string]: EnvironmentSummary}) : string {
    return environmentMap[envId]
        ? environmentMap[envId].name
        : 'ENVIRONMENT DELETED';
}

function getTargetName(targetId: string, targetMap: {[id: string]: string}) : string {
    return targetMap[targetId]
        ? targetMap[targetId]
        : 'TARGET DELETED';
}

function getGroupName(groupId: string, groupMap: {[id: string]: GroupSummary}) : string {
    return groupMap[groupId]
        ? groupMap[groupId].name
        : 'GROUP DELETED';
}

// Checks if the target user that is provided is allowed. Defaults to using a
// single target user if only one is allowed. Returns the targetUser to use when
// connecting.
export async function connectCheckAllowedTargetUsers(targetName: string, providedTargetUser: string, allowedTargetUsers: string[], logger: Logger): Promise<string> {
    if(providedTargetUser) { // User specified a targetUser explicitly in the connect string
        if(! includes(allowedTargetUsers, providedTargetUser)) {
            logger.error(`You do not have permission to connect as targetUser: ${providedTargetUser}`);
            logger.info(`Allowed target users: ${allowedTargetUsers}`);
            await cleanExit(1, logger);
        }
        return providedTargetUser;
    } else { // User did not specify any targetUser in the connect string
        if(allowedTargetUsers.length === 0) {
            logger.error(`You do not have permission to connect to ${targetName} as any target user. Please check your policy configuration.`);
            await cleanExit(1, logger);
        } else if(allowedTargetUsers.length == 1) {
            // If there is only one allowed targetUser then default to that one
            logger.info(`Using target user: ${allowedTargetUsers[0]}`);
            return allowedTargetUsers[0];
        } else {
            logger.warn(`Multiple allowed targetUsers found for target ${targetName} please specify one in the connection string`);
            logger.info(`e.g zli connect ${allowedTargetUsers[0]}@${targetName}`);
            logger.info(`Allowed target users: ${allowedTargetUsers}`);
            await cleanExit(1, logger);
        }
    }
}

export function readFile(filePath: string): Promise<string> {
    return util.promisify(fs.readFile)(filePath, 'utf8');
}

export async function getEnvironmentFromName(enviromentName: string, envs: EnvironmentSummary[], logger: Logger): Promise<EnvironmentSummary> {
    const environment = envs.find(envDetails => envDetails.name == enviromentName);
    if (!environment) {
        logger.error(`Environment ${enviromentName} does not exist`);
        await cleanExit(1, logger);
    }
    return environment;
}

export function randomAlphaNumericString(length: number) : string {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}


/**
 * Converts a SsmTargetSummary to the common TargetSummary interface so it can be used with other targets
 */
export function ssmTargetToTargetSummary(ssm: SsmTargetSummary): TargetSummary {
    return {
        type: TargetType.SsmTarget,
        id: ssm.id,
        name: ssm.name,
        environmentId: ssm.environmentId,
        agentVersion: ssm.agentVersion,
        status: ssm.status,
        targetUsers: ssm.allowedTargetUsers?.map(u => u.userName),
        region: ssm.region,
        agentPublicKey: ssm.agentPublicKey
    };
}

/**
 * Converts a DynamicAccessConfigSummary to the common TargetSummary interface so it can be used with other targets
 */
export function dynamicConfigToTargetSummary(config: DynamicAccessConfigSummary): TargetSummary {
    return {
        type: TargetType.DynamicAccessConfig,
        id: config.id,
        name: config.name,
        environmentId: config.environmentId,
        agentVersion: 'N/A',
        // DynamicAccessConfigStatus only has offline/online states
        status: (config.status === DynamicAccessConfigStatus.Offline) ? TargetStatus.Offline : TargetStatus.Online,
        targetUsers: config.allowedTargetUsers?.map(u => u.userName),
        region: 'N/A',
        agentPublicKey: 'N/A'
    };
}

/**
 * Converts a BzeroAgentSummary to the common TargetSummary interface so it can be used with other targets
 */
export function bzeroTargetToTargetSummary(bzeroTarget: BzeroAgentSummary): TargetSummary {
    return {
        type: toTargetType(bzeroTarget.agentType),
        agentPublicKey: bzeroTarget.agentPublicKey,
        id: bzeroTarget.id,
        name: bzeroTarget.name,
        status: parseTargetStatus(bzeroTarget.status.toString()),
        environmentId: bzeroTarget.environmentId,
        targetUsers: bzeroTarget.allowedTargetUsers.map(u => u.userName),
        agentVersion: bzeroTarget.agentVersion,
        region: bzeroTarget.region
    };
}

/**
 * Converts a DbTargetSummary to the common TargetSummary interface so it can be used with other targets
 */
export function dbTargetToTargetSummary(dbTarget: DbTargetSummary): TargetSummary {
    return {
        type: TargetType.Db,
        agentPublicKey: dbTarget.agentPublicKey,
        id: dbTarget.id,
        name: dbTarget.name,
        status: parseTargetStatus(dbTarget.status.toString()),
        environmentId: dbTarget.environmentId,
        targetUsers: dbTarget.allowedTargetUsers?.map(u => u.userName),
        agentVersion: dbTarget.agentVersion,
        region: dbTarget.region
    };
}

/**
 * handle npm install edge case
 * note: node will also show up when running 'npm run start -- ssh-proxy-config'
 * so for devs, they should not rely on generating configs from here and should
 * map their dev executables in the ProxyCommand output
 */
export function getZliRunCommand(): string {
    // ref: https://nodejs.org/api/process.html#process_process_argv0
    let processName = process.argv0;
    // see discussion here: https://github.com/bastionzero/zli/pull/329#discussion_r828118468
    if (processName.includes('node')) processName = 'npm run start';
    return processName;
}

export function isZliSilent(silent_flag: boolean, json_flag: boolean) {
    if(silent_flag) return true;
    else if(json_flag) return true;
    return false;
}

export function toUpperCase(str: string): string
{
    return str.charAt(0).toUpperCase().concat(str.slice(1));
}

/**
 * Checks if the provided path is writable/createable.
 */
export async function checkWritableFilePath(filePath: string, errorMessage: string) {
    try {
        await util.promisify(fs.writeFile)(filePath, '');
    } catch(err) {
        throw new Error(`${errorMessage}: ${err}`);
    }
}

/**
 * Creates a json file with bzero credentials in the current path, or, if provided, to a custom path.
 */
export async function createBzeroCredsFile(mfaSecret: string, orgId: string, idp: IdentityProvider, bzeroCredsPath: string) {
    const bzeroCreds: ServiceAccountBzeroCredentials = {
        mfa_secret: mfaSecret,
        org_id: orgId,
        identity_provider: idp
    };

    try {
        await util.promisify(fs.writeFile)(bzeroCredsPath, JSON.stringify(bzeroCreds));
    } catch(err) {
        throw new Error(`Failed to create bzeroCreds file at ${bzeroCredsPath}: ${err}`);
    }
}

export function userOrSubjectRequired(argv: baseCreatePolicyCmdBuilderArgs) : boolean {
    if(!!argv.users || !!argv.subjects)
        return !!argv.users || !!argv.subjects;
    throw new Error('Either user(s) or subject(s) need to be provided');
}

/**
 * Function that converts any string that looks like a date into a js date
 * object that is suitable for passing into JSON.parse()
 * https://stackoverflow.com/a/29971466/9186330
 */
export function jsonDateReviver(key: any, value: any): any {
    const reDateDetect = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;  // starts with: 2015-04-29T22:06:55
    if (typeof value == 'string' && (reDateDetect.exec(value))) {
        return new Date(value);
    }
    return value;
}

/**
 * Custom JSON.parse() function that also converts date strings to js date objects
 */
export function customJsonParser(text: string) {
    return JSON.parse(text, jsonDateReviver);
}

/**
 * Custom function to extract the secret from the url returned by reset
 */
export function extractMfaSecretFromUrl(mfaSecretUrl: string) {
    const secretRegEx = /secret=(?<base32Secret>\w*)\&/;
    const matches = mfaSecretUrl.match(secretRegEx);
    const base32Secret = matches?.groups.base32Secret;
    return base32Secret;
}