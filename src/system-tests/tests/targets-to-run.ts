import { DigitalOceanDistroImage } from "../digital-ocean/digital-ocean-ssm-target.service.types";
import { convertAwsRegionToDigitalOceanRegion } from "../digital-ocean/digital-ocean.types";
import { TestTarget } from "./system-test.types";

const defaultAwsRegion = 'us-east-1';
const defaultDigitalOceanRegion = convertAwsRegionToDigitalOceanRegion(defaultAwsRegion);

// Different types of SSM test targets to create. Each object corresponds to a
// new droplet.
export const ssmTestTargetsToRun: TestTarget[] = [
    // old autodiscovery script (all-in-bash)
    { installType: 'ad', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2120', sshCaseId: '2147'},
    // { type: 'autodiscovery', dropletImage: DigitalOceanDistroImage.CentOS8 },
    { installType: 'ad', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2121', sshCaseId: '2148' },
    { installType: 'ad', dropletImage: DigitalOceanDistroImage.Ubuntu20, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2122', sshCaseId: '2149' },
    // new autodiscovery script (self-registration)
    { installType: 'pm', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2123', sshCaseId: '2150' },
    { installType: 'pm', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2124', sshCaseId: '2151' },
];

// Different types of vt targets to create for each type of operating system
export const vtTestTargetsToRun: TestTarget[] = [
    { installType: 'pm-vt', dropletImage: DigitalOceanDistroImage.BzeroVTAL2TestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, webCaseId: '2154', dbCaseId: '2152'},
    { installType: 'pm-vt', dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, webCaseId: '2155', dbCaseId: '2153'}
];
