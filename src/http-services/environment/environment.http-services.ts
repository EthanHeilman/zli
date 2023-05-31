import { CreateEnvironmentRequest } from 'webshell-common-ts/http/v2/environment/requests/create-environment.requests';
import { EditEnvironmentRequest } from 'webshell-common-ts/http/v2/environment/requests/edit-environment.requests';
import { CreateEnvironmentResponse } from 'webshell-common-ts/http/v2/environment/responses/create-environment.responses';
import { EnvironmentSummary } from 'webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

export class EnvironmentHttpService extends HttpService {
    protected constructor() {
        super()
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new EnvironmentHttpService();
        service.make(configService, 'api/v2/environments/', logger);
        return service
    }

    public ListEnvironments(): Promise<EnvironmentSummary[]> {
        return this.Get();
    }

    public GetEnvironment(environmentId: string): Promise<EnvironmentSummary> {
        return this.Get(environmentId);
    }

    public EditEnvironment(environmentId: string, req: EditEnvironmentRequest): Promise<void> {
        return this.Patch(environmentId, req);
    }

    public CreateEnvironment(req: CreateEnvironmentRequest): Promise<CreateEnvironmentResponse> {
        return this.Post<CreateEnvironmentRequest, CreateEnvironmentResponse>('', req);
    }

    public DeleteEnvironment(envId: string): Promise<void> {
        return this.Delete(envId);
    }
}