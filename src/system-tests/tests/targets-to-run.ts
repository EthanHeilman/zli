import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { convertAwsRegionToDigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { TestTarget } from './system-test.types';

const defaultAwsRegion = 'us-east-1';
const defaultDigitalOceanRegion = convertAwsRegionToDigitalOceanRegion(defaultAwsRegion);

const AWS_ENV = process.env.AWS_ENV ? process.env.AWS_ENV : 'dev';
const BZERO_IN_CI = process.env.BZERO_IN_CI ? (process.env.BZERO_IN_CI === '1') : false;

// Different types of SSM test targets to create. Each object corresponds to a
// new droplet.
export const ssmTestTargetsToRun: TestTarget[] = [{ installType: 'pm', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2123', badConnectCaseId: '2352', sshCaseId: '2150', badSshCaseId: '2361' }];

// Different types of vt targets to create for each type of operating system
export const vtTestTargetsToRun: TestTarget[] = [{ installType: 'pm-vt', dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, webCaseId: '2155', dbCaseId: '2153', badDbCaseId: '2372', badWebCaseId: '2374' }];

if (AWS_ENV === 'prod' && BZERO_IN_CI) {
    ssmTestTargetsToRun.concat([
        // old autodiscovery script (all-in-bash)
        { installType: 'ad', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2120', badConnectCaseId: '2347', sshCaseId: '2147', badSshCaseId: '2358' },
        { installType: 'ad', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2121', badConnectCaseId: '2350', sshCaseId: '2148', badSshCaseId: '2359' },
        { installType: 'ad', dropletImage: DigitalOceanDistroImage.Ubuntu20, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2122', badConnectCaseId: '2351', sshCaseId: '2149', badSshCaseId: '2360' },
        // new autodiscovery script (self-registration)
        { installType: 'pm', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2124', badConnectCaseId: '2353', sshCaseId: '2151', badSshCaseId: '2362' },
        // // Ansible ssm target test
        { installType: 'as', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2348', badConnectCaseId: '2354', sshCaseId: '2356', badSshCaseId: '2365' },
        { installType: 'as', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, connectCaseId: '2349', badConnectCaseId: '2355', sshCaseId: '2357', badSshCaseId: '2366' },
    ]);

    vtTestTargetsToRun.concat([
        { installType: 'pm-vt', dropletImage: DigitalOceanDistroImage.BzeroVTAL2TestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion, webCaseId: '2154', dbCaseId: '2152', badDbCaseId: '2371', badWebCaseId: '2373' },
    ]);
}