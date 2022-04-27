import { IN_CI, IN_PIPELINE } from './system-test';
import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { TestTarget } from './system-test.types';

const defaultAwsRegion = 'us-east-1';
const defaultDigitalOceanRegion = convertAwsRegionToDigitalOceanRegion(defaultAwsRegion);

// Different types of SSM test targets to create. Each object corresponds to a
// new droplet.
export const ssmTestTargetsToRun: TestTarget[] = [{ installType: 'pm', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2123', closeCaseId: '3655', badConnectCaseId: '2352', sshCaseId: '2150', badSshCaseId: '2361', groupConnectCaseId: '3094', sessionRecordingCaseId: '3042' }];

// Different types of bzero targets to create for each type of operating system
export const bzeroTestTargetsToRun: TestTarget[] = [{ installType: 'pm-bzero', dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId:'2125', webCaseId: '2155', dbCaseId: '2153', badDbCaseId: '2372', badWebCaseId: '2374' }];

if (IN_PIPELINE && IN_CI) {
    ssmTestTargetsToRun.concat([
        // old autodiscovery script (all-in-bash)
        { installType: 'ad', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2120', closeCaseId: '3652', badConnectCaseId: '2347', sshCaseId: '2147', badSshCaseId: '2358', groupConnectCaseId: '3091', sessionRecordingCaseId: '4974' },
        { installType: 'ad', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2121', closeCaseId: '3653', badConnectCaseId: '2350', sshCaseId: '2148', badSshCaseId: '2359', groupConnectCaseId: '3092', sessionRecordingCaseId: '4970' },
        { installType: 'ad', dropletImage: DigitalOceanDistroImage.Ubuntu20, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2122', closeCaseId: '3654', badConnectCaseId: '2351', sshCaseId: '2149', badSshCaseId: '2360', groupConnectCaseId: '3093',  sessionRecordingCaseId: '4971' },
        // new autodiscovery script (self-registration)
        { installType: 'pm', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2124', closeCaseId: '3656', badConnectCaseId: '2353', sshCaseId: '2151', badSshCaseId: '2362', groupConnectCaseId: '3095', sessionRecordingCaseId: '4969' },
        // // Ansible ssm target test
        { installType: 'as', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2348', closeCaseId: '3659', badConnectCaseId: '2354', sshCaseId: '2356', badSshCaseId: '2365', groupConnectCaseId: '3098', sessionRecordingCaseId: '4972' },
        { installType: 'as', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2349', closeCaseId: '3660', badConnectCaseId: '2355', sshCaseId: '2357', badSshCaseId: '2366', groupConnectCaseId: '3099', sessionRecordingCaseId: '4973' },
    ]);

    bzeroTestTargetsToRun.concat([
        { installType: 'pm-bzero', dropletImage: DigitalOceanDistroImage.BzeroVTAL2TestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, webCaseId: '2154', dbCaseId: '2152', badDbCaseId: '2371', badWebCaseId: '2373' },
    ]);
}