import { KeySplittingService } from '../../webshell-common-ts/keysplitting.service/keysplitting.service';
import { ConfigService } from '../config.service/config.service';
import { Logger } from '../logger.service/logger';
import { SsmTunnelService } from '../ssm-tunnel/ssm-tunnel.service';
import { cleanExit } from './clean-exit.handler';
import { Dictionary } from 'lodash';


export async function sshProxyHandler(configService: ConfigService, logger: Logger, sshTunnelParameters: SshTunnelParameters, keySplittingService: KeySplittingService, envMap: Dictionary<string>) {
    let ssmTunnelService = new SsmTunnelService(logger, configService, keySplittingService, envMap['enableKeysplitting'] == 'true');
    ssmTunnelService.errors.subscribe(async errorMessage => {
        process.stderr.write(`\n${errorMessage}\n`);
        await cleanExit(1, logger);
    });

    if( await ssmTunnelService.setupWebsocketTunnel(sshTunnelParameters.host, sshTunnelParameters.user, sshTunnelParameters.port, sshTunnelParameters.identityFile)) {
        process.stdin.on('data', async (data) => {
            ssmTunnelService.sendData(data);
        });
    }
}

export interface SshTunnelParameters {
    host: string;
    user: string;
    port: number;
    identityFile: string;
}