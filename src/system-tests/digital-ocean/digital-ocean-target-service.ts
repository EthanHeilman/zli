import { Retrier } from '@jsier/retrier';
import { ConfigService } from 'services/config/config.service';
import { Logger } from 'services/logger/logger.service';
import { BzeroTargetStatusPollError, CreateNewDropletParameters, DigitalOceanBZeroTarget, DigitalOceanTargetParameters } from 'system-tests/digital-ocean/digital-ocean-target.service.types';
import { checkAllSettledPromise } from 'system-tests/tests/utils/utils';
import { TargetStatus } from 'webshell-common-ts/http/v2/target/types/targetStatus.types';
import { BzeroAgentSummary } from 'webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { BzeroTargetHttpService } from 'http-services/targets/bzero/bzero.http-services';
import { createApiClient } from 'dots-wrapper';
import { IDroplet } from 'dots-wrapper/dist/droplet/types/droplet';


export class DigitalOceanTargetService {
    private doClient;
    private bzeroTargetHttpService: BzeroTargetHttpService;

    constructor(
        apiToken: string,
        private configService: ConfigService,
        private logger: Logger
    ) {
        this.doClient = createApiClient({ token: apiToken });
        this.bzeroTargetHttpService = new BzeroTargetHttpService(this.configService, this.logger);
    }

    /**
     * Create a DigitalOcean droplet to host a new target
     * @param autoDiscoveryScript The autodiscovery script which is passed in as
     * a User-Data script during droplet creation
     * @returns Information about the created droplet
     */
    public async createDigitalOceanTarget(parameters: DigitalOceanTargetParameters, autoDiscoveryScript: string): Promise<IDroplet> {
        // Create the droplet
        let droplet = await this.createNewDroplet({ ...parameters.dropletParameters, userDataScript: autoDiscoveryScript });

        // Poll until DigitalOcean says the droplet is online / active
        droplet = await this.pollDropletUntilActive(droplet.id);

        return droplet;
    }

    /**
     * Cleans up a DigitalOcean target by deleting both the target and droplet.
     *
     * @param doTarget The DigitalOcean target to clean up
     * @returns A promise that represents the results of deleting the droplet and target concurrently
     */
    public async deleteDigitalOceanTarget(doTarget: DigitalOceanBZeroTarget): Promise<void> {
        const cleanupPromises = [];

        // Only delete droplet if it is set
        if (doTarget.droplet) {
            cleanupPromises.push(this.doClient.droplet.deleteDroplet({ droplet_id: doTarget.droplet.id}));
        }

        const targetType = doTarget.type;
        if(targetType === 'linux') {
            // Only delete bzero target if it is set
            if (doTarget.bzeroTarget) {
                cleanupPromises.push(this.bzeroTargetHttpService.DeleteBzeroTarget(doTarget.bzeroTarget.id));
            }
        } else {
            throw new Error(`Invalid target type passed: ${targetType}`);
        }

        await checkAllSettledPromise(Promise.allSettled(cleanupPromises));
    }

    /**
     * Helper function to delete a bzero target from Bastion
     * @param targetId Target id we are deleting
     */
    public async deleteBzeroTarget(targetId: string) {
        this.bzeroTargetHttpService.DeleteBzeroTarget(targetId);
    }

    /**
     * Polls the bastion until the Bzero target is Online and the agent version is known.
     *
     * @param bzeroTargetName The name of the target to poll
     * @returns Information about the target
     */
    public async pollBZeroTargetOnline(bzeroTargetName: string, retryDelay = 10 * 1000, maxRetries = 60): Promise<BzeroAgentSummary> {
        // Try 60 times with a delay of 10 seconds between each attempt (10 min).
        const retrier = new Retrier({
            limit: maxRetries,
            delay: retryDelay,
            stopRetryingIf: (reason: any) => reason instanceof BzeroTargetStatusPollError && reason.bzeroTarget.status === TargetStatus.Error
        });

        // We don't know target ID initially
        let bzeroTargetId: string = '';
        return retrier.resolve(() => new Promise<BzeroAgentSummary>(async (resolve, reject) => {
            const checkIsTargetOnline = (bzeroTarget: BzeroAgentSummary) => {
                if (bzeroTarget.status === TargetStatus.Online && bzeroTarget.agentVersion !== '') {
                    resolve(bzeroTarget);
                } else {
                    throw new BzeroTargetStatusPollError(bzeroTarget, `Target ${bzeroTarget.name} is not online. Has status: ${bzeroTarget.status}`);
                }
            };
            try {
                if (bzeroTargetId === '') {
                    // We don't know the target ID yet, so we have to use
                    // the less efficient list API to learn about the ID
                    const bzeroTargets = await this.bzeroTargetHttpService.ListBzeroTargets();
                    const foundTarget = bzeroTargets.find(target => target.name === bzeroTargetName);
                    if (foundTarget) {
                        bzeroTargetId = foundTarget.id;
                        checkIsTargetOnline(foundTarget);
                    } else {
                        throw new Error(`Target with name ${bzeroTargetName} does not exist`);
                    }
                } else {
                    // Target ID is known
                    const target = await this.bzeroTargetHttpService.GetBzeroTarget(bzeroTargetId);
                    checkIsTargetOnline(target);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Polls DigitalOcean's GET droplet API until it says the provided droplet
     * has status == "active".
     * @param dropletId ID of droplet to query
     * @returns Droplet information after its status == "active"
     */
    private async pollDropletUntilActive(dropletId: number): Promise<IDroplet> {
        // Try 80 times with a delay of 10 seconds between each attempt (~13 min).
        const retrier = new Retrier({
            limit: 80,
            delay: 1000 * 10,
        });

        return retrier.resolve(() => new Promise<IDroplet>(async (resolve, reject) => {
            try {
                // A status string indicating the state of the Droplet instance. This may be "new", "active", "off", or "archive".
                // Source: https://docs.digitalocean.com/reference/api/api-reference/#operation/get_droplet
                const droplet = (await this.doClient.droplet.getDroplet({droplet_id: dropletId})).data.droplet;
                if (droplet.status === 'active') {
                    resolve(droplet);
                } else {
                    throw new Error(`Droplet is not active. Has status: ${droplet.status}`);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Create a new droplet
     * @param parameters Parameters to use when creating the droplet
     * @returns Information about the newly created droplet
     */
    private async createNewDroplet(
        parameters: CreateNewDropletParameters
    ): Promise<IDroplet> {
        const request = {
            name: parameters.dropletName,
            region: parameters.dropletRegion,
            size: parameters.dropletSize,
            image: parameters.dropletImage,
            user_data: parameters.userDataScript,
            tags: parameters.dropletTags,
            // Key fingerprint for system-test SSH key that exists on our
            // account. This parameter is required when using custom images
            // (e.g. AL2). Find the key fingerprint of SSH keys using: doctl
            // compute ssh-key list
            ssh_keys: ['1d:24:d2:70:6d:28:b4:77:fa:94:5c:42:cf:7a:8f:03']
        };

        const createDropletResp = await this.doClient.droplet.createDroplet(request);
        return createDropletResp.data.droplet;
    }
}
