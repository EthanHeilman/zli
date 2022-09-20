import got, { Got } from 'got/dist/source';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';

interface connectionServiceUrlResponse {
    connectionServiceUrl: string;
}

export class StatusHttpService {
    private httpClient: Got;
    private configService: ConfigService;
    private logger: Logger;

    private connectionServiceUrl: URL;

    constructor(configService: ConfigService, logger: Logger) {
        this.configService = configService;
        this.logger = logger;
        this.httpClient = got.extend({
            hooks: {
                beforeRequest: [
                    (options) => this.logger.trace(`Making request to: ${options.url}`)
                ],
                afterResponse: [
                    (response, _) => {
                        this.logger.trace(`Request completed to: ${response.url}`);
                        return response;
                    }
                ]
            },
            timeout: 5000 // Timeout after 5 seconds
        });
    }

    public async BastionHealth() : Promise<string> {
        const resp = await this.httpClient.get(`${this.configService.serviceUrl()}status/health`);
        return resp.body;
    }

    public async ConnectionOrchestratorHealth(region: string): Promise<string> {
        const connectionServiceBaseUrl = await this.getConnectionServiceBaseUrl(region);
        const resp = await this.httpClient.get(`${connectionServiceBaseUrl}status/health`);
        return resp.body;
    }

    public async ConnectionNodeHealth(region: string, connectionNodeId: string): Promise<string> {
        const connectionServiceBaseUrl = await this.getConnectionServiceBaseUrl(region);
        const resp = await this.httpClient.get(`${connectionServiceBaseUrl}${connectionNodeId}/status/health`);
        return resp.body;
    }

    // Lookup the connectionServiceUrl from bastion and then cache it
    private async getConnectionServiceBaseUrl(region: string): Promise<URL> {
        if(! this.connectionServiceUrl) {
            const resp: connectionServiceUrlResponse = await this.httpClient.get(`${this.configService.serviceUrl()}api/v2/connection-service/url`).json();
            this.connectionServiceUrl = new URL(resp.connectionServiceUrl);
        }

        // Add AWS region to the host
        // https://sebby-connection-service.bastionzero.com => https://sebby-connection-service-us-east-1.bastionzero.com
        const hostSplit = this.connectionServiceUrl.host.split('.');
        hostSplit[0] = `${hostSplit[0]}-${region}`;

        return new URL(`https://${hostSplit.join('.')}`);
    }
}