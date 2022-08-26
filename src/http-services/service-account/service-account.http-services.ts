import { CreateServiceAccountRequest } from '../../../webshell-common-ts/http/v2/service-account/requests/create-service-account.requests';
import { AddGcpProjectRequest } from '../../../webshell-common-ts/http/v2/service-account/requests/add-gcp-project.requests';

import { CreateServiceAccountResponse } from '../../../webshell-common-ts/http/v2/service-account/responses/create-service-accounts.responses';
import { ListServiceAccountsResponse } from '../../../webshell-common-ts/http/v2/service-account/responses/list-service-accounts.responses';
import { AddGcpProjectResponse } from '../../../webshell-common-ts/http/v2/service-account/responses/add-gcp-project.responses';

import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';


export class ServiceAccountHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/service-accounts', logger);
    }

    public ListServiceAccounts(): Promise<ListServiceAccountsResponse[]>
    {
        return this.Get();
    }

    public CreateServiceAccount(request: CreateServiceAccountRequest): Promise<CreateServiceAccountResponse> {
        // return this.Post(request);
        return this.Get(request.email);
    }

    public AddGCPProject(request: AddGcpProjectRequest): Promise<AddGcpProjectResponse> {
        // return this.Post(request);
        return this.Get(`GCP/${request.id}`);
    }
}