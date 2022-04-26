import { IdentityProviderGroupsMetadataResponse } from '../../../webshell-common-ts/http/v2/organization/responses/identity-provider-groups-metadata.responses';
import { OrganizationGlobalRegistrationKeyResponse } from '../../../webshell-common-ts/http/v2/organization/responses/organization-global-registration-key.response';
import { GroupSummary } from '../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { OrganizationSummary } from '../../../webshell-common-ts/http/v2/organization/types/organization-summary.types';
import { OrganizationRegistrationKeySettingSummary } from '../../../webshell-common-ts/http/v2/organization/types/organization-registration-key-setting-summary.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class OrganizationHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/organization/', logger);
    }

    public ListGroups(): Promise<GroupSummary[]>
    {
        return this.Get('groups', {});
    }

    public FetchGroups(): Promise<GroupSummary[]>
    {
        return this.Post('groups/fetch', {});
    }

    public GetCredentialsMetadata(): Promise<IdentityProviderGroupsMetadataResponse>
    {
        return this.Get('groups/credentials');
    }

    public GetUserOrganization(): Promise<OrganizationSummary>
    {
        return this.Get();
    }

    public GetRegistrationKeySettings(): Promise<OrganizationRegistrationKeySettingSummary>
    {
        return this.Get('registration-key/settings');
    }

    public EnableGlobalRegistrationKey(defaultRegistrationKeyId: string): Promise<OrganizationGlobalRegistrationKeyResponse>
    {
        const toPost = {
            defaultRegistrationKeyId: defaultRegistrationKeyId
        };
        return this.Post('registration-key/enable-enforce-global-key', toPost);
    }

    public DisableGlobalRegistrationKey(): Promise<OrganizationGlobalRegistrationKeyResponse>
    {
        return this.Post('registration-key/disable-enforce-global-key', {});
    }
}