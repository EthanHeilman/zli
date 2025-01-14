
import { CreateAuthorizedGithubActionRequest } from 'webshell-common-ts/http/v2/authorized-github-action/requests/authorized-github-action-create.requests';
import { AuthorizedGithubActionSummary } from 'webshell-common-ts/http/v2/authorized-github-action/types/authorized-github-action-summary.types';
import { HttpService } from 'services/http/http.service';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';

export class AuthorizedGithubActionHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/github-actions', logger);
    }

    public CreateAuthorizedGithubAction(request: CreateAuthorizedGithubActionRequest): Promise<AuthorizedGithubActionSummary> {
        return this.Post('', request);
    }

    public GetAuthorizedGithubAction(id: string): Promise<AuthorizedGithubActionSummary> {
        return this.Get(id);
    }

    public ListAuthorizedGithubActions(): Promise<AuthorizedGithubActionSummary[]> {
        return this.Get();
    }

    public DeleteAuthorizedGithubAction(id: string): Promise<void> {
        return this.Delete(id);
    }
}