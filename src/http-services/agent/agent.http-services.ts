import { HttpService } from 'services/http/http.service';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { ConfigureServiceAccountRequest} from 'webshell-common-ts/http/v2/service-account/requests/configure-service-account.requests';

export class AgentHttpService extends HttpService {
    protected constructor() {
        super();
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new AgentHttpService();
        service.make(configService, 'api/v2/agent/', logger);
        return service;
    }

    public ConfigureBzeroTarget(request: ConfigureServiceAccountRequest): Promise<void> {
        return this.Post(`configure`, request);
    }
}
