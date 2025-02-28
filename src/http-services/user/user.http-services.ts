import { Dictionary } from 'lodash';
import { Cookie } from 'tough-cookie';
import { UserRegisterResponse } from 'webshell-common-ts/http/v2/user/responses/user-register.responses';
import { UserSummary } from 'webshell-common-ts/http/v2/user/types/user-summary.types';
import { UpdateUserRequest } from 'webshell-common-ts/http/v2/user/requests/update-user.requests';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

export class UserHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/users/', logger);
    }

    public async Register(): Promise<UserRegisterResponse>
    {
        const tokenSet = await this.configService.getTokenSet();

        const requestHeaders = {
            'AccessToken': tokenSet.access_token,
            'IdToken': tokenSet.id_token,
        };

        const resp = await this.Post<{}, UserRegisterResponse>('register', {}, requestHeaders);

        // Store the session cookies in config
        const cookies = await this.cookieJar.getCookies(this.baseUrl + '/register');
        const cookiesDict: Dictionary<Cookie> = {};
        for (const cookie of cookies) {
            cookiesDict[cookie.key] = cookie;
        }

        if (cookiesDict['sessionId'].value != this.configService.getSessionId()) {
            this.logger.debug('Unrecognized session id, proceeding with new one');
            this.configService.setSessionId(cookiesDict['sessionId'].value);
        }

        if (cookiesDict['sessionToken'].value != this.configService.getSessionToken()) {
            this.logger.debug('Received new session token for user, refreshing session');
            this.configService.setSessionToken(cookiesDict['sessionToken'].value);
        }

        return resp;
    }

    public Me(): Promise<UserSummary>
    {
        return this.Get('me');
    }

    public ListUsers(): Promise<UserSummary[]>
    {
        return this.Get();
    }

    public GetUserByEmail(
        email: string
    ): Promise<UserSummary>
    {
        return this.Get(email);
    }

    public GetUserById(id: string): Promise<UserSummary> {
        return this.Get(id);
    }

    public EditUser(id: string, request: UpdateUserRequest): Promise<void> {
        return this.Patch(id, request);
    }
}