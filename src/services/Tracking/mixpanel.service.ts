import { ConfigService } from 'services/config/config.service';

import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import mixpanel, { Mixpanel } from 'mixpanel';
import { TrackNewConnection } from 'services/Tracking/mixpanel.service.types';


export class MixpanelService
{
    private mixpanelClient: Mixpanel;
    private userId: string;
    private sessionId: string;

    constructor(mixpanelToken: string, userId: string, sessionId: string)
    {
        this.mixpanelClient = mixpanel.init(mixpanelToken, {
            protocol: 'https',
        });

        this.userId = userId;
        this.sessionId = sessionId;
    }

    static async init(configService: ConfigService) {
        const mixpanelToken = configService.getMixpanelToken();
        const userId = (await configService.me()).id;
        const sessionId = configService.getSessionId();

        return new MixpanelService(mixpanelToken, userId, sessionId);
    }

    // track connect calls
    public TrackNewConnection(targetType: TargetType): void
    {
        const trackMessage : TrackNewConnection = {
            distinct_id: this.userId,
            client_type: 'CLI',
            UserSessionId: this.sessionId,
            ConnectionType: targetType,
        };

        this.mixpanelClient.track('ConnectionOpened', trackMessage);
    }

    public TrackCliCall(eventName: string, properties: Dictionary<string | string[] | unknown>)
    {
        // append the following properties
        properties.distinct_id = this.userId;
        properties.client_type = 'CLI';
        properties.UserSessionId = this.sessionId;

        this.mixpanelClient.track(eventName, properties);
    }

    public TrackCliCommand(version: string, command: string, args: string[]) {
        this.TrackCliCall(
            'CliCommand',
            {
                'cli-version': version,
                'command': command,
                args: args
            }
        );
    }
}
