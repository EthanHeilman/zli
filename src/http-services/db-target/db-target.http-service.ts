import { URLSearchParams } from 'url';

import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';
import { DbTargetSummary } from 'webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { AddNewDbTargetRequest } from 'webshell-common-ts/http/v2/target/db/requests/add-new-db-target.requests';
import { AddNewDbTargetResponse } from 'webshell-common-ts/http/v2/target/db/responses/add-new-db-target.responses';
import { EditDbTargetRequest } from 'webshell-common-ts/http/v2/target/db/requests/edit-db-target.requests';

export class DbTargetHttpService extends HttpService
{
    protected constructor() {
        super();
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new DbTargetHttpService();
        service.make(configService, 'api/v2/targets/database', logger);
        return service;
    }

    public ListDbTargets(): Promise<DbTargetSummary[]> {
        return this.Get('');
    }

    public CreateDbTarget(request: AddNewDbTargetRequest): Promise<AddNewDbTargetResponse> {
        return this.Post('', request);
    }

    public GetDbTarget(targetId: string): Promise<DbTargetSummary> {
        return this.Get(targetId);
    }

    public GetDbTargets(targetNames: string[], targetIds: string[], envName: string, envId: string): Promise<DbTargetSummary[]> {
        const queryParams = new URLSearchParams({});
        targetNames.forEach(t => queryParams.append('targetNames', t));
        targetIds.forEach(t => queryParams.append('targetIds', t));

        if (envId) {
            queryParams.append('envId', envId);
        } else if (envName) {
            queryParams.append('envName', envName);
        }

        return this.Get('', queryParams);
    }

    public DeleteDbTarget(targetId: string): Promise<void> {
        return this.Delete(targetId);
    }

    public EditDbTarget(targetId: string, request: EditDbTargetRequest): Promise<DbTargetSummary> {
        return this.Patch(targetId, request);
    }
}