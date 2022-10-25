import { BzeroAgentSummary } from '../../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { EditBzeroAgentTargetRequest } from '../../../../webshell-common-ts/http/v2/target/bzero/requests/edit-bzero-agent.requests';
import { RestartBzeroAgentTargetRequest, RetrieveAgentLogsRequest  } from '../../../../webshell-common-ts/http/v2/target/bzero/requests/bzero-agent.requests';
import { ConfigService } from '../../../services/config/config.service';
import { HttpService } from '../../../services/http/http.service';
import { Logger } from '../../../services/logger/logger.service';

export class BzeroTargetHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/targets/bzero/', logger);
    }

    public GetBzeroTarget(targetId: string): Promise<BzeroAgentSummary> {
        return this.Get(targetId);
    }

    public DeleteBzeroTarget(targetId: string): Promise<void> {
        return this.Delete(targetId);
    }

    public ListBzeroTargets(): Promise<BzeroAgentSummary[]> {
        return this.Get();
    }

    public EditBzeroTarget(targetId: string, request: EditBzeroAgentTargetRequest): Promise<BzeroAgentSummary> {
        return this.Patch(targetId, request);
    }

    public RestartBzeroTarget(request: RestartBzeroAgentTargetRequest): Promise<void> {
        return this.Post(`restart`, request);
    }

    public RetrieveAgentLogs(request: RetrieveAgentLogsRequest): Promise<void> {
        return this.Post(`retrieve-logs`, request);
    }
}
