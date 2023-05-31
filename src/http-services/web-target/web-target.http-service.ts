import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';
import { WebTargetSummary } from 'webshell-common-ts/http/v2/target/web/types/web-target-summary.types';
import { AddNewWebTargetRequest } from 'webshell-common-ts/http/v2/target/web/requests/add-new-web-target.requests';
import { AddNewWebTargetResponse } from 'webshell-common-ts/http/v2/target/web/responses/add-new-web-target.responses';
import { EditWebTargetRequest } from 'webshell-common-ts/http/v2/target/web/requests/edit-web-target.requests';

export class WebTargetHttpService extends HttpService
{
    protected constructor() {
        super();
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new WebTargetHttpService();
        service.make(configService, 'api/v2/targets/web', logger);
        return service;
    }

    public ListWebTargets(): Promise<WebTargetSummary[]> {
        return this.Get('', {});
    }

    public CreateWebTarget(request: AddNewWebTargetRequest): Promise<AddNewWebTargetResponse> {
        return this.Post('', request);
    }

    public DeleteWebTarget(targetId: string): Promise<void> {
        return this.Delete(targetId);
    }

    public GetWebTarget(targetId: string): Promise<WebTargetSummary> {
        return this.Get(targetId);
    }

    public EditWebTarget(targetId: string, request: EditWebTargetRequest): Promise<WebTargetSummary> {
        return this.Patch(targetId, request);
    }
}