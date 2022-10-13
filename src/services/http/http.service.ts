import got, { Got, HTTPError } from 'got/dist/source';
import { Dictionary } from 'lodash';
import { ConfigService } from '../config/config.service';
import FormData from 'form-data';
import { Logger } from '../logger/logger.service';
import { URLSearchParams } from 'url';
import {Cookie, CookieJar} from 'tough-cookie';
import { OAuthService } from '../oauth/oauth.service';

export class HttpService {
    // ref for got: https://github.com/sindresorhus/got
    protected httpClient: Got;
    protected baseUrl: string;
    protected configService: ConfigService;
    private authorized: boolean;
    protected logger: Logger;
    protected cookieJar: CookieJar;

    constructor(configService: ConfigService, serviceRoute: string, logger: Logger, authorized: boolean = true) {
        this.configService = configService;
        this.authorized = authorized;
        this.logger = logger;
        this.baseUrl = `${this.configService.serviceUrl()}${serviceRoute}`;
        this.cookieJar = new CookieJar();

        const setSessionTokenCookies = () => {
            const sessionId = this.configService.getSessionId();
            if (sessionId) {
                const sessionIdCookie = new Cookie({ key: 'sessionId', value: sessionId, path: '/', secure: true, sameSite: 'Strict' });
                this.cookieJar.setCookieSync(sessionIdCookie, this.baseUrl);
            }

            const sessionToken = this.configService.getSessionToken();
            if (sessionToken) {
                const sessionTokenCookie = new Cookie({ key: 'sessionToken', value: sessionToken, path: '/', secure: true, sameSite: 'Strict' });
                this.cookieJar.setCookieSync(sessionTokenCookie, this.baseUrl);
            }
        }

        setSessionTokenCookies();

        const instance = got.extend({
            cookieJar: this.cookieJar,
            prefixUrl: this.baseUrl,
            // Remember to set headers before calling API
            hooks: {
                beforeRequest: [
                    (options) => this.logger.trace(`Making request to: ${options.url}`)
                ],
                afterResponse: [
                    async (response, retryWithMergedOptions) => {
                        this.logger.trace(`Request completed to: ${response.url}`);


                        // Unauthorized
                        if (response.statusCode === 401) {
                            this.logger.debug(`old id token: ${configService.getIdToken()}`)
                            this.logger.debug('about to refresh')
                            this.logger.debug(`Base URL: ${this.baseUrl}`);
                            // Refresh!
                            const oauthService = new OAuthService(this.configService, this.logger);
                            const idToken = await oauthService.getIdTokenAndCheckSessionToken();

                            this.logger.debug(`new id token: ${idToken}`);

                            const storedAuthHeader = this.configService.getAuthHeader()
                            this.logger.debug(`stored auth header: ${storedAuthHeader}`);

                            const updatedOptions = {
                                headers: {
                                    Authorization: storedAuthHeader
                                }
                            }

                            // Update the headers
                            // this.httpClient = this.httpClient.extend(updatedOptions);

                            // Save for further requests
                            instance.defaults.options = got.mergeOptions(instance.defaults.options, updatedOptions);

                            // And the session token cookies
                            setSessionTokenCookies();

                            // Make a new retry
                            return retryWithMergedOptions(updatedOptions);
                        }

                        return response;
                    }
                ]
            },
            retry: {
                limit: 1,
            },
            timeout: 30000, // Timeout after 30 seconds
            mutableDefaults: true
            // throwHttpErrors: false // potentially do this if we want to check http without exceptions
        });

        this.httpClient = instance
    }

    private setHeaders(extraHeaders? : Dictionary<string>) {
        const headers: Dictionary<string> = extraHeaders ?? {};

        //TODO : This could eventually be transitioned to a cookie as well
        if (this.authorized) headers['Authorization'] = this.configService.getAuthHeader();

        // append headers
        this.httpClient = this.httpClient.extend({ headers: headers });
    }

    private getHttpErrorMessage(route: string, error: HTTPError): string {
        this.logger.debug(`Error in ${this.baseUrl}${route}`);
        if(error.response && error.response.body ) {
            // Log the error response body if it exists. This might contain
            // server validation errors in the case of 400 errors as well as
            // custom error messages for 500 errors
            this.logger.debug(JSON.stringify(error.response.body));
        }

        let errorMessage = error.message;

        if (!error.response) {
            return `HttpService Error:\n${errorMessage}`;
        }

        if (error.response.statusCode === 401) {
            // 401 errors can have either a message in body or a custom
            // backend exception in body

            // In case of the custom exception
            if (error.response.body) {
                try {
                    const parsedJSON = JSON.parse(error.response.body as string);
                    errorMessage = JSON.stringify(parsedJSON.errorMsg.errorMessage);
                } catch { // In case of a body message
                    errorMessage = error.response.body as string;
                }
            }
            return `Authentication Error:\n${errorMessage}`;
        } else if (error.response.statusCode === 502) {
            return 'Service is offline';
        } else if (error.response.statusCode === 500) {
            // Handle 500 errors by returning our custom exception message
            // Pull out the specific error message from the back end
            if (error.response.body) {
                try {
                    const parsedJSON = JSON.parse(error.response.body as string);
                    errorMessage = parsedJSON['errorMsg'];
                } catch (e) {
                    errorMessage = '';
                }
            }
            return `Server Error: ${errorMessage}`;
        } else if (error.response.statusCode === 404) {
            return `Resource not found:\n Status code: 404 at ${error.request.requestUrl}`;
        } else {
            return `Unknown Error:\nStatusCode: ${error.response.statusCode}\n${errorMessage}`;
        }
    }

    protected getFormDataFromRequest(request: any): FormData {
        return Object.keys(request).reduce((formData, key) => {
            formData.append(key, request[key]);
            return formData;
        }, new FormData());
    }

    protected async Get<TResp>(route?: string, queryParams?: Dictionary<string> | URLSearchParams, extraHeaders? : Dictionary<string>): Promise<TResp> {
        this.setHeaders(extraHeaders);

        try {
            const resp: TResp = await this.httpClient.get(
                route,
                {
                    searchParams: queryParams,
                    parseJson: text => JSON.parse(text)
                }
            ).json();
            return resp;
        } catch (error) {
            error.message = this.getHttpErrorMessage(route, error);
            throw error;
        }
    }

    // Use this Get request when a string response is expected.
    protected async GetText(route?: string, queryParams?: Dictionary<string> | URLSearchParams, extraHeaders?: Dictionary<string>): Promise<string> {
        this.setHeaders(extraHeaders);

        try {
            const response = await this.httpClient.get(
                route,
                {
                    searchParams: queryParams
                }
            ).text();
            return response;
        } catch (error) {
            error.message = this.getHttpErrorMessage(route, error);
            throw error;
        }
    }

    protected async Delete<TResp>(route?: string, extraHeaders? : Dictionary<string>): Promise<TResp> {
        this.setHeaders(extraHeaders);

        try {
            const resp: TResp = await this.httpClient.delete(
                route,
                {
                    parseJson: text => JSON.parse(text),
                }
            ).json();
            return resp;
        } catch (error) {
            error.message = this.getHttpErrorMessage(route, error);
            throw error;
        }
    }

    protected async Post<TReq, TResp>(route: string, body: TReq, extraHeaders? : Dictionary<string>): Promise<TResp> {
        this.setHeaders(extraHeaders);

        try {
            const resp: TResp = await this.httpClient.post(
                route,
                {
                    json: body,
                    parseJson: text => JSON.parse(text),
                }
            ).json();
            return resp;
        } catch (error) {
            error.message = this.getHttpErrorMessage(route, error);
            throw error;
        }
    }

    protected async Patch<TReq, TResp>(route: string, body?: TReq, extraHeaders? : Dictionary<string>): Promise<TResp> {
        this.setHeaders(extraHeaders);

        try {
            const resp: TResp = await this.httpClient.patch(
                route,
                {
                    json: body,
                    parseJson: text => JSON.parse(text),
                }
            ).json();
            return resp;
        } catch (error) {
            error.message = this.getHttpErrorMessage(route, error);
            throw error;
        }
    }

    protected async FormPostWithException<TReq, TResp>(route: string, body: TReq): Promise<TResp> {
        this.setHeaders();

        const formBody = this.getFormDataFromRequest(body);

        const resp: TResp = await this.httpClient.post(
            route,
            {
                body: formBody
            }
        ).json();
        return resp;
    }

    protected async FormPost<TReq, TResp>(route: string, body: TReq): Promise<TResp> {
        this.setHeaders();

        const formBody = this.getFormDataFromRequest(body);

        try {
            const resp: TResp = await this.httpClient.post(
                route,
                {
                    body: formBody
                }
            ).json();
            return resp;
        } catch (error) {
            error.message = this.getHttpErrorMessage(route, error);
            throw error;
        }
    }
}