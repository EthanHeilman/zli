import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { GenerateCertificateRequest } from 'webshell-common-ts/http/v2/certificate/requests/generate-certificate.request';
import { GenerateCertificateResponse } from 'webshell-common-ts/http/v2/certificate/responses/generate-certificate.response';
import { Logger } from 'services/logger/logger.service';

export class CertificateHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/certificate', logger);
    }

    public GenerateCertificate(req: GenerateCertificateRequest): Promise<GenerateCertificateResponse> {
        return this.Post('generate', req);
    }
}