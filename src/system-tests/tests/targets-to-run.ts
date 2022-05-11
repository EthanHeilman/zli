import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { TestTarget } from './system-test.types';
import { Logger } from '../../services/logger/logger.service';

const defaultAwsRegion = 'us-east-1';
const defaultDigitalOceanRegion = convertAwsRegionToDigitalOceanRegion(defaultAwsRegion);

// Different types of SSM test targets to create. Each object corresponds to a
// new droplet.
export const ssmTestTargetsToRun: TestTarget[] = [
    {
        installType: 'pm',
        dropletImage: DigitalOceanDistroImage.Debian11,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2123',
        closeCaseId: '3655',
        badConnectCaseId: '2352',
        sshCaseId: '2150',
        badSshCaseId: '2361',
        groupConnectCaseId: '3094',
        sessionRecordingCaseId: '3042',
        attachCaseId: '6495',
    }
];

// Different types of bzero targets to create for each type of operating system
export const bzeroTestTargetsToRun: TestTarget[] = [
    {
        installType: 'pm-bzero',
        dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        webCaseId: '2155',
        dbCaseId: '2153',
        iperfUpload: '14970',
        iperfDownload: '14972',
        badDbCaseId: '2372',
        badWebCaseId: '2374',
        connectCaseId: '6529',
        closeCaseId: '6565',
        badConnectCaseId: '6559',
        groupConnectCaseId: '6561',
        sessionRecordingCaseId: '6572',
        attachCaseId: '6563',
    }
];

// Extra targets to run when IN_PIPELINE and IN_CI mode

export const extraSsmTestTargetsToRun: TestTarget[] = [
    // old autodiscovery script (all-in-bash)
    {
        installType: 'ad',
        dropletImage: DigitalOceanDistroImage.AmazonLinux2,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2120',
        closeCaseId: '3652',
        badConnectCaseId: '2347',
        sshCaseId: '2147',
        badSshCaseId: '2358',
        groupConnectCaseId: '3091',
        sessionRecordingCaseId: '4974',
        attachCaseId: '6491',
    },
    {
        installType: 'ad',
        dropletImage: DigitalOceanDistroImage.Debian11,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2121',
        closeCaseId: '3653',
        badConnectCaseId: '2350',
        sshCaseId: '2148',
        badSshCaseId: '2359',
        groupConnectCaseId: '3092',
        sessionRecordingCaseId: '4970',
        attachCaseId: '6493',
    },
    {
        installType: 'ad',
        dropletImage: DigitalOceanDistroImage.Ubuntu20,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2122',
        closeCaseId: '3654',
        badConnectCaseId: '2351',
        sshCaseId: '2149',
        badSshCaseId: '2360',
        groupConnectCaseId: '3093',
        sessionRecordingCaseId: '4971',
        attachCaseId: '6494',
    },
    // new autodiscovery script (self-registration)
    {
        installType: 'pm',
        dropletImage: DigitalOceanDistroImage.AmazonLinux2,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2124',
        closeCaseId: '3656',
        badConnectCaseId: '2353',
        sshCaseId: '2151',
        badSshCaseId: '2362',
        groupConnectCaseId: '3095',
        sessionRecordingCaseId: '4969',
        attachCaseId: '6496',
    },
    // Ansible ssm target test
    {
        installType: 'as',
        dropletImage: DigitalOceanDistroImage.Debian11,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2348',
        closeCaseId: '3659',
        badConnectCaseId: '2354',
        sshCaseId: '2356',
        badSshCaseId: '2365',
        groupConnectCaseId: '3098',
        sessionRecordingCaseId: '4972',
        attachCaseId: '6498',
    },
    {
        installType: 'as',
        dropletImage: DigitalOceanDistroImage.AmazonLinux2,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        connectCaseId: '2349',
        closeCaseId: '3660',
        badConnectCaseId: '2355',
        sshCaseId: '2357',
        badSshCaseId: '2366',
        groupConnectCaseId: '3099',
        sessionRecordingCaseId: '4973',
        attachCaseId: '6499',
    }
];

export const extraBzeroTestTargetsToRun: TestTarget[] = [
    {
        installType: 'pm-bzero',
        dropletImage: DigitalOceanDistroImage.BzeroVTAL2TestImage,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        webCaseId: '2154',
        dbCaseId: '2152',
        badDbCaseId: '2371',
        iperfUpload: '14969',
        iperfDownload: '14972',
        badWebCaseId: '2373',
        connectCaseId: '6462',
        closeCaseId: '6564',
        badConnectCaseId: '6558',
        groupConnectCaseId: '6560',
        sessionRecordingCaseId: '6571',
        attachCaseId: '6562',
    }
];

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
        let adCloseCasedId = null;
        let pmCloseCasedId = null;
        let pmGroupConnectCaseId = null;
        let adGroupConnectCaseId = null;
        let adSessionRecordingCaseId = null;
        let pmSessionRecordingCaseId = null;
        let adAttachCaseId = null;
        let pmAttachCaseId = null;

        switch (awsRegion) {
        case 'ap-northeast-1':
            adConnectCaseId = '2176';
            adBadConnectCaseId = '2367';
            pmConnectCaseId = '2177';
            pmBadConnectBaseId = '2368';

            pmCloseCasedId = '3658';
            adCloseCasedId = '3657';

            pmGroupConnectCaseId = '3097';
            adGroupConnectCaseId = '3096';

            adSshCaseId = '2178';
            adBadSshCaseId = '2363';
            pmSshCaseId = '2179';
            pmBadSshCaseId = '2364';

            adSessionRecordingCaseId = '5003';
            pmSessionRecordingCaseId = '5004';

            adAttachCaseId = '6492';
            pmAttachCaseId = '6497';
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
                groupConnectCaseId: adGroupConnectCaseId,
                closeCaseId: adCloseCasedId,
                sessionRecordingCaseId: adSessionRecordingCaseId,
                attachCaseId: adAttachCaseId
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
                groupConnectCaseId: pmGroupConnectCaseId,
                closeCaseId: pmCloseCasedId,
                sessionRecordingCaseId: pmSessionRecordingCaseId,
                attachCaseId: pmAttachCaseId,
            }
        );
    });

    return toReturn;
}

