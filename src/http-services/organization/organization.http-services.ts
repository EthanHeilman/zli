import { IdentityProviderGroupsMetadataResponse } from 'webshell-common-ts/http/v2/organization/responses/identity-provider-groups-metadata.responses';
import { OrganizationGlobalRegistrationKeyResponse } from 'webshell-common-ts/http/v2/organization/responses/organization-global-registration-key.response';
import { GroupSummary } from 'webshell-common-ts/http/v2/organization/types/group-summary.types';
import { OrganizationSummary } from 'webshell-common-ts/http/v2/organization/types/organization-summary.types';
import { OrgBZCertValidationInfo } from 'webshell-common-ts/http/v2/organization/types/organization-bzcert-validation-info.types';
import { OrganizationRegistrationKeySettingSummary } from 'webshell-common-ts/http/v2/organization/types/organization-registration-key-setting-summary.types';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

export class OrganizationHttpService extends HttpService
{
    protected constructor() {
        super()
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new OrganizationHttpService();
        service.make(configService, 'api/v2/organization/', logger);
        return service
    }

    public ListGroups(): Promise<GroupSummary[]>
    {
        return this.Get('groups', {});
    }

    public FetchGroups(): Promise<GroupSummary[]>
    {
        return this.Post('groups/fetch', {});
    }

    public FetchGroupsMembership(id: string): Promise<GroupSummary[]>
    {
        return this.Post(`groups-memberships/fetch/${id}`, {});
    }

    public GetCredentialsMetadata(): Promise<IdentityProviderGroupsMetadataResponse>
    {
        return this.Get('groups/credentials');
    }

    public GetUserOrganization(): Promise<OrganizationSummary>
    {
        return this.Get();
    }

    public GetUserOrganizationBZCertValidationInfo(): Promise<OrgBZCertValidationInfo>
    {
        return this.Get(`bzcert-validation-info`);
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