import { Logger } from 'services/logger/logger.service';
import { ConfigService } from 'services/config/config.service';
import { DynamicAccessTargetState } from 'webshell-common-ts/http/v2/connection/types/dynamic-access-target-state';
import { ShellConnectionSummary } from 'webshell-common-ts/http/v2/connection/types/shell-connection-summary.types';
import { ConnectionHttpService } from 'http-services/connection/connection.http-services';
import { ConnectionState } from 'webshell-common-ts/http/v2/connection/types/connection-state.types';
import { Retrier } from '@jsier/retrier';

export class DynamicAccessConnectionUtils {

    private connectionService: ConnectionHttpService;

    constructor(
        private logger: Logger,
        configService: ConfigService
    ) {
        this.connectionService = await ConnectionHttpService.init(configService, logger);
    }

    /**
     *
     * @param connectionId The connectionId of the DAT connection.
     */
    async waitForDATConnection(connectionId: string) : Promise<ShellConnectionSummary>{

        // Try 60 times with a delay of 5 seconds between each attempt (5 min).
        const retrier = new Retrier({
            limit: 60,
            delay: 1000 * 5,
            stopRetryingIf: (reason: any) => reason instanceof DATStartError
        });

        const connectionSummary = await retrier.resolve(() => new Promise<ShellConnectionSummary>(async (resolve, reject) => {
            try {
                // Query the DAT connection state to get state transition updates
                const datConnectionDetails = await this.connectionService.GetDATConnectionDetails(connectionId);

                // Report DAT status depending on the DAT state
                switch(datConnectionDetails.dynamicAccessTargetState)
                {
                case DynamicAccessTargetState.Starting:
                    this.logger.info('Waiting on the start webhook to create the dynamic access target...');
                    break;
                case DynamicAccessTargetState.Started:
                    this.logger.info('Waiting on the dynamic access target to register and come online...');
                    break;
                case DynamicAccessTargetState.StartError:
                    // Stop retrying immediately and report the error if we are in StartError state
                    reject(new DATStartError(`Failed to start dynamic access target: ${datConnectionDetails.provisioningServerErrorMessage}`));
                }

                if(datConnectionDetails.connectionState != ConnectionState.Pending) {
                    // Resolve with the shell connection summary once we
                    // move out of pending state
                    resolve(await this.connectionService.GetShellConnection(connectionId));
                } else {
                    reject('Timed out waiting for dynamic access target to come online');
                }
            } catch(err) {
                reject(err);
            }
        }));

        this.logger.info('Dynamic access target is online!');

        // Return connection summary which should now include the specific targetId of the underlying
        return connectionSummary;
    }
}

/**
 * Explicit Error to throw if there is an error in the start webhook for a DAT
 */
class DATStartError extends Error {
    constructor(message?: string) {
        super(message);
    }
}