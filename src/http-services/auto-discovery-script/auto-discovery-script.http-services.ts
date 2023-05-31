import { ScriptResponse } from 'webshell-common-ts/http/v2/autodiscovery-script/responses/script.responses';
import { ScriptTargetNameOption } from 'webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';


export async function getAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    scriptTargetNameOption: ScriptTargetNameOption,
    agentVersion: string
): Promise<string> {
    const autodiscoveryScriptHttpService = await AutoDiscoveryScriptHttpService.init(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetAutodiscoveryScript(scriptTargetNameOption, environmentId, agentVersion);

    return scriptResponse.autodiscoveryScript;
}

export async function getBzeroBashAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    scriptTargetNameOption: ScriptTargetNameOption,
    beta: boolean = false
): Promise<string> {
    const autodiscoveryScriptHttpService = await AutoDiscoveryScriptHttpService.init(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetBzeroBashAutodiscoveryScript(scriptTargetNameOption, environmentId, beta);

    return scriptResponse.autodiscoveryScript;
}

export async function getAnsibleAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    agentVersion: string
) {
    const autodiscoveryScriptHttpService = await AutoDiscoveryScriptHttpService.init(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetAnsibleAutodiscoveryScript(environmentId, agentVersion);

    return scriptResponse.autodiscoveryScript;
}

export async function getBzeroAnsibleAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    beta: boolean = false
) {
    const autodiscoveryScriptHttpService = await AutoDiscoveryScriptHttpService.init(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetBzeroAnsibleAutodiscoveryScript(environmentId, beta);

    return scriptResponse.autodiscoveryScript;
}

export class AutoDiscoveryScriptHttpService extends HttpService {
    protected constructor() {
        super()
    }

    static async init(configService: ConfigService, logger: Logger) {
        const service = new AutoDiscoveryScriptHttpService();
        service.make(configService, 'api/v2/autodiscovery-scripts', logger);
        return service
    }

    public GetAutodiscoveryScript(
        targetNameOption: ScriptTargetNameOption,
        environmentId: string,
        agentVersion?: string
    ): Promise<ScriptResponse> {
        return this.Get(
            'universal',
            {
                targetNameOption: targetNameOption,
                environmentId: environmentId,
                agentVersion: agentVersion
            });
    }

    public GetAnsibleAutodiscoveryScript(
        environmentId: string,
        agentVersion?: string
    ): Promise<ScriptResponse> {
        return this.Get(
            'ansible',
            {
                environmentId: environmentId,
                agentVersion: agentVersion
            });
    }

    public GetBzeroBashAutodiscoveryScript(
        targetNameOption: ScriptTargetNameOption,
        environmentId: string,
        beta: boolean
    ): Promise<ScriptResponse> {
        return this.Get(
            beta ? 'bzero/bash/beta' : 'bzero/bash',
            {
                targetNameOption: targetNameOption,
                environmentId: environmentId
            });
    }

    public GetBzeroAnsibleAutodiscoveryScript(
        environmentId: string,
        beta: boolean
    ): Promise<ScriptResponse> {
        return this.Get(
            beta ? 'bzero/ansible/beta' : 'bzero/ansible',
            {
                environmentId: environmentId
            });
    }
}