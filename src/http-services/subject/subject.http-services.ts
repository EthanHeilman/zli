import { SubjectSummary } from 'webshell-common-ts/http/v2/subject/types/subject-summary.types';
import { UpdateSubjectRequest } from 'webshell-common-ts/http/v2/subject/requests/update-subject.requests';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

export class SubjectHttpService extends HttpService
{
    protected constructor() {
        super()
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new SubjectHttpService();
        service.make(configService, 'api/v2/subjects/', logger);
        return service
    }

    public Me(): Promise<SubjectSummary>
    {
        return this.Get('me');
    }

    public ListSubjects(): Promise<SubjectSummary[]>
    {
        return this.Get();
    }

    public GetSubjectByEmail(
        email: string
    ): Promise<SubjectSummary>
    {
        return this.Get(email);
    }

    public GetSubjectById(id: string): Promise<SubjectSummary> {
        return this.Get(id);
    }

    public UpdateSubjectRole(id: string, request: UpdateSubjectRequest): Promise<void> {
        return this.Patch(id, request);
    }
}