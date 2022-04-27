import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { SessionRecordingSummary } from '../../../webshell-common-ts/http/v2/session-recording/types/session-recording-summary.types';

export class SessionRecordingHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/session-recordings', logger);
    }

    public GetSessionRecording(connectionId: string): Promise<string> {
        return this.GetText(connectionId);
    }

    public ListSessionRecordings(): Promise<SessionRecordingSummary[]> {
        return this.Get();
    }

    public DeleteSessionRecording(connectionId: string): Promise<void> {
        return this.Delete(connectionId);
    }
}