import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { TestTarget } from './system-test.types';
import { Logger } from '../../services/logger/logger.service';
import { BzeroContainerTestTarget } from './suites/agent-container';

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
        sshBadUserCaseId: '2361',
        sshConnectFailsCaseId: '84380',
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
        sshCaseId: '46456',
        sshWithEnvCaseId: '209887',
        sshByUuidCaseId: '87909',
        sshBadUserCaseId: '46459',
        sshConnectFailsCaseId: '84381',
        sshTunnelFailsCaseId: '84392',
        sshScpCaseId: '84393',
        sshSftpCaseId: '90259',
        sshScpByUuidCaseId: '87908',
        badConnectCaseId: '6559',
        groupConnectCaseId: '6561',
        sessionRecordingCaseId: '6572',
        attachCaseId: '6563',
    }
];

// Container images to run
export const agentContainersToRun : BzeroContainerTestTarget[] = [
    {
        type: 'al2',
        installType: 'pm-pod',
        shellAndRecordCaseID: '28268',
    },
    {
        type: 'ubuntu',
        installType: 'pm-pod',
        shellAndRecordCaseID: '28269',
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
        sshBadUserCaseId: '2358',
        sshConnectFailsCaseId: '84382',
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
        sshBadUserCaseId: '2359',
        sshConnectFailsCaseId: '84383',
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
        sshBadUserCaseId: '2360',
        sshConnectFailsCaseId: '84384',
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
        sshBadUserCaseId: '2362',
        sshConnectFailsCaseId: '84386',
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
        sshBadUserCaseId: '2365',
        sshConnectFailsCaseId: '84387',
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
        sshBadUserCaseId: '2366',
        sshConnectFailsCaseId: '84388',
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
        iperfDownload: '14971',
        badWebCaseId: '2373',
        sshCaseId: '46454',
        sshWithEnvCaseId: '209886',
        sshByUuidCaseId: '87910',
        sshBadUserCaseId: '46458',
        sshConnectFailsCaseId: '84389',
        sshTunnelFailsCaseId: '84394',
        sshScpCaseId: '84395',
        sshSftpCaseId: '90260',
        sshScpByUuidCaseId: '87911',
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

    const toReturn: TestTarget[] = [];
    enabledExtraRegions.forEach(awsRegion => {
        // Depending on the awsRegion we have different ssh and connect caseIds
        let adConnectCaseId = null;
        let adBadConnectCaseId = null;
        let pmConnectCaseId = null;
        let pmBadConnectBaseId = null;
        let adSshCaseId = null;
        let adSshBadUserCaseId = null;
        let adSshConnectFailsCaseId = null;
        let pmSshCaseId = null;
        let pmSshBadUserCaseId = null;
        let pmSshConnectFailsCaseId = null;
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
            adSshBadUserCaseId = '2363';
            adSshConnectFailsCaseId = '84390';

            pmSshCaseId = '2179';
            pmSshBadUserCaseId = '2364';
            pmSshConnectFailsCaseId = '84391';

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
                sshBadUserCaseId: adSshBadUserCaseId,
                sshConnectFailsCaseId: adSshConnectFailsCaseId,
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
                sshBadUserCaseId: pmSshBadUserCaseId,
                sshConnectFailsCaseId: pmSshConnectFailsCaseId,
                groupConnectCaseId: pmGroupConnectCaseId,
                closeCaseId: pmCloseCasedId,
                sessionRecordingCaseId: pmSessionRecordingCaseId,
                attachCaseId: pmAttachCaseId,
            }
        );
    });

    return toReturn;
}

