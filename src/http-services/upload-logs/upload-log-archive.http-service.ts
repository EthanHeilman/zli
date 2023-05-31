import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';
import { UploadLogArchiveRequest } from 'webshell-common-ts/http/v2/upload-logs/requests/upload-log-archive.request';

export class UploadLogArchiveHttpService extends HttpService
{
    protected constructor() {
        super();
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new UploadLogArchiveHttpService();
        service.make(configService, 'api/v2/upload-logs/', logger);
        return service;
    }

    public UploadLogArchive(req: UploadLogArchiveRequest) : Promise<void>
    {
        return this.FormPost('zli', req);
    }
}
