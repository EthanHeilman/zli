import { Logger } from '../../../services/logger/logger.service';
import { DigitalOceanDistroImage } from '../../../system-tests/digital-ocean/digital-ocean-ssm-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../../../system-tests/digital-ocean/digital-ocean.types';
import { TestTarget } from "../system-test.types";

/**
 * Removes a trailing slash from a url if it exists
 */
export function stripTrailingSlash(url: string) {
    return url.replace(/\/$/, '');
}

export async function checkAllSettledPromise<T>(allSettledPromise: Promise<PromiseSettledResult<T>[]>) : Promise<void> {
    const failedPromiseResults = (await allSettledPromise).find(p => p.status === 'rejected');

    if(failedPromiseResults) {
        console.log((failedPromiseResults as PromiseRejectedResult).reason);
        throw((failedPromiseResults as PromiseRejectedResult).reason);
    }
}


/**
 * Helper function to automatically add a list of defaulted regions to run system-test against, or pull from the EXTRA_REGIONS env var
 * @param logger Logger to log any warnings
 * @returns Returns a list of additional ssm targets to run
 */
export function initRegionalSSMTargetsTestConfig(logger: Logger): TestTarget[] {
    const enabledExtraRegionsEnvVar = process.env.EXTRA_REGIONS;
    const enabledExtraRegions = [];

    if (enabledExtraRegionsEnvVar === undefined) {
        // If not set, add Tokyo as a default extra region
        enabledExtraRegions.push('ap-northeast-1');
    } else {
        const enabledExtraRegionsEnvVarSplitAwsRegions = enabledExtraRegionsEnvVar.split(',').filter(r => r != '');
        enabledExtraRegions.push(...enabledExtraRegionsEnvVarSplitAwsRegions);
    }
    
    let toReturn : TestTarget[]= []
    enabledExtraRegions.forEach(awsRegion => {
        // Depending on the awsRegion we have different ssh and connect caseIds
        var adConnectCaseId = null;
        var pmConnectCaseId = null;
        var adSshCaseId = null;
        var pmSshCaseId = null;
        
        switch (awsRegion) {
            case 'ap-northeast-1':
                adConnectCaseId = '2176'
                pmConnectCaseId = '2177'
                adSshCaseId = '2178'
                pmSshCaseId = '2179'
                break
            default:
                logger.warn(`Unhandled TestRail awsRegion passed: ${awsRegion}`)
        }

        toReturn.push(
            {
                installType: 'ad',
                dropletImage: DigitalOceanDistroImage.Debian11,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion,
                connectCaseId: adConnectCaseId,
                sshCaseId: adSshCaseId
            },
            {
                installType: 'pm',
                dropletImage: DigitalOceanDistroImage.Debian11,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion,
                connectCaseId: pmConnectCaseId,
                sshCaseId: pmSshCaseId
            }
        )
    });

    return toReturn;
}