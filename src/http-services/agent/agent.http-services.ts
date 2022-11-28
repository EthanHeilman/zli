import { HttpService } from '../../../src/services/http/http.service';
import { ConfigService } from '../../../src/services/config/config.service';
import { Logger } from '../../../src/services/logger/logger.service';
import { ConfigureServiceAccountRequest} from '../../../webshell-common-ts/http/v2/service-account/requests/configure-service-account.requests';

export class AgentHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/agent/', logger);
    }

    public ConfigureBzeroTarget(request: ConfigureServiceAccountRequest): Promise<void> {
        return this.Post(`configure`, request);
    }
}
