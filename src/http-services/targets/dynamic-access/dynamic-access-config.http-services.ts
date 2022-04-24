import { DynamicAccessConfigSummary } from '../../../../webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-summary.types';
import { ConfigService } from '../../../services/config/config.service';
import { HttpService } from '../../../services/http/http.service';
import { Logger } from '../../../services/logger/logger.service';
import { RegisterDynamicAccessConfigRequest } from '../../../../webshell-common-ts/http/v2/target/dynamic/requests/register-dynamic-access-config.requests';
import { RegisterDynamicAccessConfigResponse } from '../../../../webshell-common-ts/http/v2/target/dynamic/responses/register-dynamic-access-config.response';


export class DynamicAccessConfigHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/dynamic-access/', logger);
    }

    public GetDynamicAccessConfig(id: string): Promise<DynamicAccessConfigSummary> {
        return this.Get(id);
    }

    public ListDynamicAccessConfigs(): Promise<DynamicAccessConfigSummary[]>
    {
        return this.Get();
    }

    public CreateDynamicAccessConfigs(request: RegisterDynamicAccessConfigRequest): Promise<RegisterDynamicAccessConfigResponse>
    {
        return this.Post('', request);
    }

    public DeleteDynamicAccessConfigs(id: string): Promise<void>
    {
        return this.Delete(id);
    }
}