import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { ConnectionEventDataMessage } from '../../../webshell-common-ts/http/v2/event/types/connection-event-data-message';
import { CommandEventDataMessage } from '../../../webshell-common-ts/http/v2/event/types/command-event-data-message';
import { KubeEventDataMessage } from '../../../webshell-common-ts/http/v2/event/types/kube-event-data-message.types';
import { UserEventDataMessage } from '../../../webshell-common-ts/http/v2/event/types/user-event-data-message.types';
import { AgentStatusChangeData } from '../../../webshell-common-ts/http/v2/event/types/agent-status-change-data.types';


export class EventsHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/events/', logger);
    }

    public GetConnectionEvents(startTime: Date, subjectIds?: string[], targetIds?: string[]) : Promise<ConnectionEventDataMessage[]>
    {
        const params: Record<string, string> = {};
        params['startTimestamp'] = startTime.toJSON();
        if(subjectIds) {
            params['subjectIds'] = subjectIds.toString();
        }
        if (targetIds) {
            params['targetIds'] = targetIds.toString();
        }

        return this.Get('connection', params);
    }

    public GetCommandEvent(startTime: Date, subjectIds: string[]) : Promise<CommandEventDataMessage[]>
    {
        const params = {
            startTimestamp: startTime.toJSON(),
            subjectIds: subjectIds.toString()
        };
        return this.Get('command', params);
    }

    public GetKubeEvents() : Promise<KubeEventDataMessage[]>
    {
        return this.Get('kube');
    }

    public GetSubjectEvents(startTime?: Date, subjectIds?: string[], count?: number) : Promise<UserEventDataMessage[]>
    {
        const params = {
            startTimestamp: startTime?.toJSON(),
            subjectIds: subjectIds?.toString(),
            eventCount: count?.toString()
        };
        return this.Get('subject', params);
    }

    public GetAgentStatusChangeEvents(targetId: string, startTime?: Date, endTime?: Date): Promise<AgentStatusChangeData[]> {
        const params = {
            targetId: targetId,
            startTimestamp: startTime?.toJSON(),
            endTimestamp: endTime?.toJSON(),
        };

        return this.Get('agent-status-change', params);
    }
}