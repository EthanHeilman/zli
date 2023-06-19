import { ScriptResponse } from 'webshell-common-ts/http/v2/autodiscovery-script/responses/script.responses';
import { ScriptTargetNameOption } from 'webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

export async function getBashAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    scriptTargetNameOption: ScriptTargetNameOption,
    beta: boolean = false
): Promise<string> {
    const autodiscoveryScriptHttpService = new AutoDiscoveryScriptHttpService(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetBashAutodiscoveryScript(scriptTargetNameOption, environmentId, beta);

    return scriptResponse.autodiscoveryScript;
}

export async function getLinuxAnsibleAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    beta: boolean = false
) {
    const autodiscoveryScriptHttpService = new AutoDiscoveryScriptHttpService(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetLinuxAnsibleAutodiscoveryScript(environmentId, beta);

    return scriptResponse.autodiscoveryScript;
}

export class AutoDiscoveryScriptHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/autodiscovery-scripts', logger);
    }

    public GetBashAutodiscoveryScript(
        targetNameOption: ScriptTargetNameOption,
        environmentId: string,
        beta: boolean
    ): Promise<ScriptResponse> {
        return this.Get(
            beta ? 'bzero/bash/beta' : 'bzero/bash',
            {
                targetNameOption,
                environmentId,
            });
    }

    public GetLinuxAnsibleAutodiscoveryScript(
        environmentId: string,
        beta: boolean
    ): Promise<ScriptResponse> {
        return this.Get(
            beta ? 'bzero/ansible/beta' : 'bzero/ansible',
            {
                environmentId
            });
    }

    public GetPwshAutodiscoveryScript(
        targetNameOption: ScriptTargetNameOption,
        environmentId: string,
        beta: boolean
    ): Promise<ScriptResponse> {
        return this.Get(
            beta ? 'windows/powershell/beta' : 'windows/powershell',
            {
                targetNameOption,
                environmentId,
            });
    }
}