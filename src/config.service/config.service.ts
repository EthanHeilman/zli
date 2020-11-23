import Conf from "conf/dist/source";
import { TokenSet, TokenSetParameters } from "openid-client";

// refL: https://github.com/sindresorhus/conf/blob/master/test/index.test-d.ts#L5-L14
type ThoumConfigSchema = {
    authUrl: string,
    serviceUrl: string,
    tokenSet: TokenSetParameters,
    tokenSetExpireTime: number
}

export class ConfigService {
    private config: Conf<ThoumConfigSchema>;

    constructor(configName: string) {
        var appName = this.getAppName(configName);
        this.config = new Conf<ThoumConfigSchema>({
            projectName: 'thoum-cli',
            configName: configName, // prod, stage, dev
            defaults: {
                authUrl: appName ? this.getAuthUrl(appName) : undefined,
                serviceUrl:  appName ? this.getServiceUrl(appName) : undefined,
                tokenSet: undefined, // tokenSet.expires_in is Seconds
                tokenSetExpireTime: 0 // Seconds
            },
            accessPropertiesByDotNotation: true,
        });

        if(configName == "dev" && ! this.config.get('serviceUrl')) {
            let errorMessage = `Config not initialized for dev environment: Must add serviceUrl and authUrl in: ${this.config.path}`;
            throw new Error(errorMessage);
        }
    }

    public serviceUrl(): string {
        return this.config.get('serviceUrl');
    }

    public authUrl(): string {
        return this.config.get('authUrl');
    }

    public tokenSet(): TokenSetParameters {
        return this.config.get('tokenSet');
    }

    public getAuthHeader(): string {
        return `${this.tokenSet().token_type} ${this.tokenSet().access_token}`
    }

    public tokenSetExpireTime(): number
    {
        return this.config.get('tokenSetExpireTime');
    }

    public setTokenSet(tokenSet?: TokenSet, tokenSetExpireTime?: number) {
        // TokenSet implements TokenSetParameters, makes saving it like
        // this safe to do.
        if(tokenSet)
            this.config.set('tokenSet', tokenSet);

        if(tokenSetExpireTime)
            this.config.set('tokenSetExpireTime', tokenSetExpireTime);
    }

    private getAuthUrl(appName: string) {
        return `https://auth-${appName}.clunk80.com:5003/`;
    }

    private getServiceUrl(appName: string) {

        return `https://${appName}.clunk80.com/`;
    }

    private getAppName(configName: string) {
        switch(configName)
        {
            case "prod":
                return "app";
            case "stage":
                return "app-stage-4329423";
            default:
                return undefined;
        }
    }
}
