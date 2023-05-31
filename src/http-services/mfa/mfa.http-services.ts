import { MfaClearRequest } from 'webshell-common-ts/http/v2/mfa/requests/mfa-clear.requests';
import { MfaResetRequest } from 'webshell-common-ts/http/v2/mfa/requests/mfa-reset.requests';
import { MfaTokenRequest } from 'webshell-common-ts/http/v2/mfa/requests/mfa-token.requests';
import { MfaResetResponse } from 'webshell-common-ts/http/v2/mfa/responses/mfa-reset.responses';
import { MfaSummary } from 'webshell-common-ts/http/v2/mfa/types/mfa-summary.types';
import { UserMfaRequest } from 'webshell-common-ts/http/v2/mfa/requests/user-mfa.requests';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

export class MfaHttpService extends HttpService
{
    protected constructor() {
        super()
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new MfaHttpService();
        service.make(configService, 'api/v2/mfa/', logger);
        return service
    }

    public VerifyMfaTotp(token: string): Promise<void>
    {
        const request : MfaTokenRequest = {
            token: token
        };

        return this.Post('totp', request);
    }

    public ResetSecret(forceSetup?: boolean): Promise<MfaResetResponse>
    {
        const request: MfaResetRequest = {
            forceSetup: !!forceSetup
        };

        return this.Post('reset', request);
    }

    public RotateSecret(serviceAccountId: string): Promise<string>
    {
        return this.Patch('rotate/' + serviceAccountId);
    }

    public ClearSecret(userId: string): Promise<void>
    {
        const request: MfaClearRequest = {
            userId: userId
        };

        return this.Post('clear', request);
    }

    public GetCurrentUserMfaSummary(): Promise<MfaSummary> {
        return this.Get('me');
    }

    public GetUserMfaSummary(userId: string): Promise<MfaSummary> {
        return this.Get(userId);
    }

    public EnableMfa(userId: string): Promise<void> {
        return this.Post<UserMfaRequest, void>('setup', {
            userId: userId
        });
    }

    public DisableMfa(userId: string): Promise<void> {
        return this.Post<UserMfaRequest, void>('disable', {
            userId: userId
        });
    }
}