import { CreateServiceAccountRequest } from '../../../webshell-common-ts/http/v2/service-account/requests/create-service-account.requests';
import { LoginServiceAccountRequest } from '../../../webshell-common-ts/http/v2/service-account/requests/login-service-account.requests';
import { ServiceAccountSummary } from '../../../webshell-common-ts/http/v2/service-account/types/service-account-summary.types';

import { CreateServiceAccountResponse } from '../../../webshell-common-ts/http/v2/service-account/responses/create-service-account.responses';
import { UpdateServiceAccountRequest } from '../../../webshell-common-ts/http/v2/service-account/requests/update-service-account.requests';

import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { Dictionary } from 'lodash';
import { Cookie } from 'tough-cookie';


export class ServiceAccountHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/service-accounts', logger);
    }

    public async LoginServiceAccount(req: LoginServiceAccountRequest): Promise<ServiceAccountSummary> {
        const requestHeaders = {
            'AccessToken': this.configService.getAccessToken(),
            'IdToken': this.configService.getIdToken(),
        };

        const resp = await this.Post<LoginServiceAccountRequest, ServiceAccountSummary>('login', req, requestHeaders);

        // Store the session cookies in config
        const cookies = await this.cookieJar.getCookies(this.baseUrl + '/login');
        const cookiesDict: Dictionary<Cookie> = {};
        for (const cookie of cookies) {
            cookiesDict[cookie.key] = cookie;
        }

        if (cookiesDict['sessionId'].value != this.configService.getSessionId()) {
            this.logger.debug('Unrecognized session id, proceeding with new one');
            this.configService.setSessionId(cookiesDict['sessionId'].value);
        }

        if (cookiesDict['sessionToken'].value != this.configService.getSessionToken()) {
            this.logger.debug('Received new session token for service account, refreshing session');
            this.configService.setSessionToken(cookiesDict['sessionToken'].value);
        }

        return resp;
    }

    public async CreateServiceAccount(request: CreateServiceAccountRequest): Promise<CreateServiceAccountResponse> {
        const resp = await this.Post<CreateServiceAccountRequest, CreateServiceAccountResponse>('', request);
        return resp;
    }

    public GetServiceAccount(id: string): Promise<ServiceAccountSummary>
    {
        return this.Get(id);
    }

    public Me(): Promise<ServiceAccountSummary>
    {
        return this.Get('me');
    }

    public ListServiceAccounts(): Promise<ServiceAccountSummary[]>
    {
        return this.Get();
    }

    public async UpdateServiceAccount(id: string, request: UpdateServiceAccountRequest): Promise<ServiceAccountSummary> {
        const resp = await this.Patch<UpdateServiceAccountRequest, ServiceAccountSummary>(id, request);
        return resp;
    }
}