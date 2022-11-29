import { CreateShellConnectionRequest} from '../../../webshell-common-ts/http/v2/connection/requests/create-connection.request';
import { CreateConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-connection.responses';
import { ShellConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-summary.types';
import { DbConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/db-connection-summary.types';
import { KubeConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/kube-connection-summary.types';
import { DynamicAccessConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/dynamic-access-connection-summary';
import { ShellConnectionAuthDetails } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-auth-details.types';
import { ShellConnectionAttachDetails } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-attach-details.types';
import { CreateUniversalConnectionRequest } from '../../../webshell-common-ts/http/v2/connection/requests/create-universal-connection.request';
import { CreateUniversalSshConnectionRequest } from '../../../webshell-common-ts/http/v2/connection/requests/create-universal-ssh-connection.request';
import { CreateUniversalConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-universal-connection.response';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { ConnectionState } from '../../../webshell-common-ts/http/v2/connection/types/connection-state.types';

export class ConnectionHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/connections/', logger);
    }

    public GetShellConnection(connectionId: string) : Promise<ShellConnectionSummary>
    {
        return this.Get(`shell/${connectionId}`);
    }

    public GetDbConnection(connectionId: string): Promise<DbConnectionSummary>
    {
        return this.Get(`db/${connectionId}`);
    }

    public async CreateConnection(targetType: TargetType, targetId: string, sessionId: string, targetUser: string) : Promise<string>
    {
        const req : CreateShellConnectionRequest = {
            spaceId: sessionId,
            targetId: targetId,
            targetType: targetType,
            targetUser: targetUser
        };

        const resp = await this.Post<CreateShellConnectionRequest, CreateConnectionResponse>('shell', req);

        return resp.connectionId;
    }

    public CloseConnection(connectionId: string) : Promise<void>
    {
        return this.Patch(`${connectionId}/close`);
    }

    public GetShellConnectionAuthDetails(connectionId: string) : Promise<ShellConnectionAuthDetails>
    {
        return this.Get(`${connectionId}/shell/auth-details`);
    }

    public GetShellConnectionAttachDetails(connectionId: string) : Promise<ShellConnectionAttachDetails>
    {
        return this.Get(`${connectionId}/shell/attach-details`);
    }

    public GetDATConnectionDetails(connectionId: string): Promise<DynamicAccessConnectionSummary>
    {
        return this.Get(`dynamic-access/${connectionId}`);
    }

    public CreateUniversalConnection(req: CreateUniversalConnectionRequest) : Promise<CreateUniversalConnectionResponse>
    {
        return this.Post('universal', req);
    }

    public CreateUniversalSshConnection(req: CreateUniversalSshConnectionRequest) : Promise<CreateUniversalConnectionResponse>
    {
        return this.Post('universal/ssh', req);
    }

    public ListDbConnections(connectionState?: ConnectionState, userEmail?: string): Promise<DbConnectionSummary[]> {
        const params: Record<string, string> = {};
        if (connectionState) {
            params['connectionState'] = connectionState;
        }
        if (userEmail) {
            params['userEmail'] = userEmail;
        }

        return this.Get('db', params);
    }

    public ListKubeConnections(connectionState?: ConnectionState, userEmail?: string): Promise<KubeConnectionSummary[]> {
        const params: Record<string, string> = {};
        if (connectionState) {
            params['connectionState'] = connectionState;
        }
        if (userEmail) {
            params['userEmail'] = userEmail;
        }

        return this.Get('kube', params);
    }
}