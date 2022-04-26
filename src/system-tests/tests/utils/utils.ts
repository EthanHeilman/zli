import { Logger } from '../../../services/logger/logger.service';
import { DigitalOceanDistroImage } from '../../../system-tests/digital-ocean/digital-ocean-ssm-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../../../system-tests/digital-ocean/digital-ocean.types';
import { TestTarget } from '../system-test.types';

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
        return [];
    } else {
        const enabledExtraRegionsEnvVarSplitAwsRegions = enabledExtraRegionsEnvVar.split(',').filter(r => r != '');
        enabledExtraRegions.push(...enabledExtraRegionsEnvVarSplitAwsRegions);
    }

    const toReturn : TestTarget[]= [];
    enabledExtraRegions.forEach(awsRegion => {
        // Depending on the awsRegion we have different ssh and connect caseIds
        let adConnectCaseId = null;
        let adBadConnectCaseId = null;
        let pmConnectCaseId = null;
        let pmBadConnectBaseId = null;
        let adSshCaseId = null;
        let adBadSshCaseId = null;
        let pmSshCaseId = null;
        let pmBadSshCaseId = null;
        let pmGroupConnectCaseId = null;
        let adGroupConnectCaseId = null;

        switch (awsRegion) {
        case 'ap-northeast-1':
            adConnectCaseId = '2176';
            adBadConnectCaseId = '2367';
            pmConnectCaseId = '2177';
            pmBadConnectBaseId = '2368';
            pmGroupConnectCaseId = '3097';
            adGroupConnectCaseId = '3096';

            adSshCaseId = '2178';
            adBadSshCaseId = '2363';
            pmSshCaseId = '2179';
            pmBadSshCaseId = '2364';
            break;
        default:
            logger.warn(`Unhandled TestRail awsRegion passed: ${awsRegion}`);
        }

        toReturn.push(
            {
                installType: 'ad',
                dropletImage: DigitalOceanDistroImage.Debian11,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion,
                connectCaseId: adConnectCaseId,
                badConnectCaseId: adBadConnectCaseId,
                sshCaseId: adSshCaseId,
                badSshCaseId: adBadSshCaseId,
                groupConnectCaseId: adGroupConnectCaseId
            },
            {
                installType: 'pm',
                dropletImage: DigitalOceanDistroImage.Debian11,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion,
                connectCaseId: pmConnectCaseId,
                badConnectCaseId: pmBadConnectBaseId,
                sshCaseId: pmSshCaseId,
                badSshCaseId: pmBadSshCaseId,
                groupConnectCaseId: pmGroupConnectCaseId
            }
        );
    });

    return toReturn;
}