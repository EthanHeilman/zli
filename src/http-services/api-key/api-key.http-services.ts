
import { NewApiKeyRequest } from 'webshell-common-ts/http/v2/api-key/requests/new-api-key.request';
import { NewApiKeyResponse } from 'webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';
import { ApiKeySummary } from 'webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { UpdateApiKeyRequest } from 'webshell-common-ts/http/v2/api-key/requests/update-api-key.request';
import { HttpService } from 'services/http/http.service';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';

export class ApiKeyHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/api-keys', logger);
    }

    public GetApiKey(id: string): Promise<ApiKeySummary> {
        return this.Get(id);
    }

    public ListAllApiKeys(): Promise<ApiKeySummary[]> {
        return this.Get();
    }

    public CreateNewApiKey(request: NewApiKeyRequest): Promise<NewApiKeyResponse> {
        return this.Post('', request);
    }

    public DeleteApiKey(id: string): Promise<void> {
        return this.Delete(id);
    }

    public EditApiKey(id: string, request: UpdateApiKeyRequest): Promise<ApiKeySummary> {
        return this.Patch(id, request);
    }
}