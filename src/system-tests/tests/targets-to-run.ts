import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { TestTarget } from './system-test.types';
import { Logger } from '../../services/logger/logger.service';
import { BzeroContainerTestTarget } from './suites/agent-container';

const defaultAwsRegion = 'us-east-1';
const defaultDigitalOceanRegion = convertAwsRegionToDigitalOceanRegion(defaultAwsRegion);

// Different types of bzero test targets to create. Each object corresponds to a
// new droplet.
export const bzeroTestTargetsToRun: TestTarget[] = [
    {
        installType: 'pm-bzero',
        dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        webCaseId: '2155',
        iperfUpload: '14970',
        iperfDownload: '14972',
        badWebCaseId: '2374',
        connectCaseId: '6529',
        connectWithIdpUsernameCaseId: '856790',
        closeCaseId: '6565',
        sshCaseId: '46456',
        sshWithEnvCaseId: '209887',
        sshWithIdpUsernameCaseId: '856796',
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
        sendLogsCaseId: '382476',
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
export const extraBzeroTestTargetsToRun: TestTarget[] = [
    {
        installType: 'pm-bzero',
        dropletImage: DigitalOceanDistroImage.BzeroVTAL2TestImage,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        webCaseId: '2154',
        iperfUpload: '14969',
        iperfDownload: '14971',
        badWebCaseId: '2373',
        sshCaseId: '46454',
        sshWithEnvCaseId: '209886',
        sshWithIdpUsernameCaseId: '856797',
        sshByUuidCaseId: '87910',
        sshBadUserCaseId: '46458',
        sshConnectFailsCaseId: '84389',
        sshTunnelFailsCaseId: '84394',
        sshScpCaseId: '84395',
        sshSftpCaseId: '90260',
        sshScpByUuidCaseId: '87911',
        connectCaseId: '6462',
        connectWithIdpUsernameCaseId: '856791',
        closeCaseId: '6564',
        badConnectCaseId: '6558',
        groupConnectCaseId: '6560',
        sessionRecordingCaseId: '6571',
        attachCaseId: '6562',
        sendLogsCaseId: '382475'
    },
    {
        installType: 'ad-bzero',
        dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        webCaseId: '352545',
        iperfUpload: '352546',
        iperfDownload: '352547',
        badWebCaseId: '352548',
        sshCaseId: '352555',
        sshWithEnvCaseId: '352549',
        sshWithIdpUsernameCaseId: '856798',
        sshByUuidCaseId: '352550',
        sshBadUserCaseId: '352556',
        sshConnectFailsCaseId: '352557',
        sshTunnelFailsCaseId: '352551',
        sshScpCaseId: '352552',
        sshSftpCaseId: '352553',
        sshScpByUuidCaseId: '352554',
        connectCaseId: '352558',
        connectWithIdpUsernameCaseId: '856792',
        closeCaseId: '352559',
        badConnectCaseId: '352560',
        groupConnectCaseId: '352561',
        sessionRecordingCaseId: '352562',
        attachCaseId: '352563',
        sendLogsCaseId: '382477'
    },
    {
        installType: 'as-bzero',
        dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage,
        doRegion: defaultDigitalOceanRegion,
        awsRegion: defaultAwsRegion,
        webCaseId: '375558',
        iperfUpload: '375559',
        iperfDownload: '375560',
        badWebCaseId: '375561',
        sshCaseId: '375562',
        sshWithEnvCaseId: '375563',
        sshWithIdpUsernameCaseId: '856799',
        sshByUuidCaseId: '375564',
        sshBadUserCaseId: '375565',
        sshConnectFailsCaseId: '375566',
        sshTunnelFailsCaseId: '375567',
        sshScpCaseId: '375568',
        sshSftpCaseId: '375569',
        sshScpByUuidCaseId: '375570',
        connectCaseId: '375571',
        connectWithIdpUsernameCaseId: '856793',
        closeCaseId: '375572',
        badConnectCaseId: '375573',
        groupConnectCaseId: '375574',
        sessionRecordingCaseId: '375575',
        attachCaseId: '375576',
        sendLogsCaseId: '382478'
    }
];

/**
 * Helper function to automatically add a list of defaulted regions to run system-test against, or pull from the EXTRA_REGIONS env var
 * @param logger Logger to log any warnings
 * @returns Returns a list of additional targets to run
 */
export function initRegionalTargetsTestConfig(logger: Logger): TestTarget[] {
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
        let adConnectWithIdpUsernameCaseId = null;
        let adBadConnectCaseId = null;
        let pmConnectCaseId = null;
        let pmConnectWithIdpUsernameCaseId = null;
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
        let adWebCaseId: string;
        let pmWebCaseId: string;
        let adBadWebCaseId: string;
        let pmBadWebCaseId: string;
        let adIperfDownload: string;
        let pmIperfDownload: string;
        let adIperfUpload: string;
        let pmIperfUpload: string;
        let adSendLogsCaseId: string;
        let pmSendLogsCaseId: string;
        let adSshByUuidCaseId: string;
        let pmSshByUuidCaseId: string;
        let adSshScpByUuidCaseId: string;
        let pmSshScpByUuidCaseId: string;
        let adSshScpCaseId: string;
        let pmSshScpCaseId: string;
        let adSshSftpCaseId: string;
        let pmSshSftpCaseId: string;
        let adSshTunnelFailsCaseId: string;
        let pmSshTunnelFailsCaseId: string;
        let adSshWithEnvCaseId: string;
        let pmSshWithEnvCaseId: string;
        let adSshWithIdpUsernameCaseId: string;
        let pmSshWithIdpUsernameCaseId: string;

        switch (awsRegion) {
        case 'ap-northeast-1':
            adConnectCaseId = '2176';
            adConnectWithIdpUsernameCaseId = '856794';
            adBadConnectCaseId = '2367';
            pmConnectCaseId = '2177';
            pmConnectWithIdpUsernameCaseId = '856795';
            pmBadConnectBaseId = '2368';

            pmCloseCasedId = '3658';
            adCloseCasedId = '3657';

            pmGroupConnectCaseId = '3097';
            adGroupConnectCaseId = '3096';

            adSshCaseId = '2178';
            adSshBadUserCaseId = '2363';
            adSshConnectFailsCaseId = '84390';
            adSshByUuidCaseId = '648521';
            adSshScpByUuidCaseId = '648523';
            adSshScpCaseId = '648525';
            adSshSftpCaseId = '648527';
            adSshTunnelFailsCaseId = '648530';
            adSshWithEnvCaseId = '648531';
            adSshWithIdpUsernameCaseId = '856800';

            pmSshCaseId = '2179';
            pmSshBadUserCaseId = '2364';
            pmSshConnectFailsCaseId = '84391';
            pmSshByUuidCaseId = '648522';
            pmSshScpByUuidCaseId = '648524';
            pmSshScpCaseId = '648526';
            pmSshSftpCaseId = '648528';
            pmSshTunnelFailsCaseId = '648529';
            pmSshWithEnvCaseId = '648532';
            pmSshWithIdpUsernameCaseId = '856801';

            adSessionRecordingCaseId = '5003';
            pmSessionRecordingCaseId = '5004';

            adAttachCaseId = '6492';
            pmAttachCaseId = '6497';

            adWebCaseId = '648533';
            pmWebCaseId = '648534';
            adBadWebCaseId = '648535';
            pmBadWebCaseId = '648536';

            adIperfDownload = '648538';
            adIperfUpload = '648537';
            pmIperfDownload = '648540';
            pmIperfUpload = '648539';

            adSendLogsCaseId = '648542';
            pmSendLogsCaseId = '648541';
            break;
        default:
            logger.warn(`Unhandled TestRail awsRegion passed: ${awsRegion}`);
        }

        toReturn.push(
            {
                installType: 'ad-bzero',
                dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion,
                connectCaseId: adConnectCaseId,
                connectWithIdpUsernameCaseId: adConnectWithIdpUsernameCaseId,
                badConnectCaseId: adBadConnectCaseId,
                sshCaseId: adSshCaseId,
                sshBadUserCaseId: adSshBadUserCaseId,
                sshConnectFailsCaseId: adSshConnectFailsCaseId,
                groupConnectCaseId: adGroupConnectCaseId,
                closeCaseId: adCloseCasedId,
                sessionRecordingCaseId: adSessionRecordingCaseId,
                attachCaseId: adAttachCaseId,
                webCaseId: adWebCaseId,
                badWebCaseId: adBadWebCaseId,
                iperfDownload: adIperfDownload,
                iperfUpload: adIperfUpload,
                sendLogsCaseId: adSendLogsCaseId,
                sshByUuidCaseId: adSshByUuidCaseId,
                sshScpByUuidCaseId: adSshScpByUuidCaseId,
                sshScpCaseId: adSshScpCaseId,
                sshSftpCaseId: adSshSftpCaseId,
                sshTunnelFailsCaseId: adSshTunnelFailsCaseId,
                sshWithEnvCaseId: adSshWithEnvCaseId,
                sshWithIdpUsernameCaseId: adSshWithIdpUsernameCaseId
            },
            {
                installType: 'pm-bzero',
                dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion,
                connectCaseId: pmConnectCaseId,
                connectWithIdpUsernameCaseId: pmConnectWithIdpUsernameCaseId,
                badConnectCaseId: pmBadConnectBaseId,
                sshCaseId: pmSshCaseId,
                sshBadUserCaseId: pmSshBadUserCaseId,
                sshConnectFailsCaseId: pmSshConnectFailsCaseId,
                groupConnectCaseId: pmGroupConnectCaseId,
                closeCaseId: pmCloseCasedId,
                sessionRecordingCaseId: pmSessionRecordingCaseId,
                attachCaseId: pmAttachCaseId,
                webCaseId: pmWebCaseId,
                badWebCaseId: pmBadWebCaseId,
                iperfDownload: pmIperfDownload,
                iperfUpload: pmIperfUpload,
                sendLogsCaseId: pmSendLogsCaseId,
                sshByUuidCaseId: pmSshByUuidCaseId,
                sshScpByUuidCaseId: pmSshScpByUuidCaseId,
                sshScpCaseId: pmSshScpCaseId,
                sshSftpCaseId: pmSshSftpCaseId,
                sshTunnelFailsCaseId: pmSshTunnelFailsCaseId,
                sshWithEnvCaseId: pmSshWithEnvCaseId,
                sshWithIdpUsernameCaseId: pmSshWithIdpUsernameCaseId
            }
        );
    });

    return toReturn;
}

