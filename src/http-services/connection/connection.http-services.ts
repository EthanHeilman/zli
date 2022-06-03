import { CreateShellConnectionRequest} from '../../../webshell-common-ts/http/v2/connection/requests/create-connection.request';
import { CreateConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-connection.responses';
import { ShellConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-summary.types';
import { DynamicAccessConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/dynamic-access-connection-summary';
import { ShellConnectionAuthDetails } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-auth-details.types';
import { ShellConnectionAttachDetails } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-attach-details.types';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

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
        return  this.Get(`dynamic-access/${connectionId}`);
    }
}