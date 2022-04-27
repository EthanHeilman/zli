import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanRegion } from '../digital-ocean/digital-ocean.types';

/**
 * SSMTestTargetAutoDiscovery represents an SSM test target that should be
 * registered using the traditional, all-in-bash autodiscovery script that is
 * retrieved from the backend.
 */
export type SSMTestTargetAutoDiscovery = BaseTarget & {
    installType: 'ad';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

/**
 * SSMTestTargetAutoDiscovery represents an SSM test target that should be
 * registered using the ansible script retrieved from the backend.
 */
export type SSMTestTargetAnsibleAutoDiscovery = BaseTarget & {
    installType: 'as';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

/**
 * SSMTestTargetSelfRegistrationAutoDiscovery represents an SSM test target that
 * should be registered using the new, self-registration flow built into the
 * agent itself.
 */
export type SSMTestTargetSelfRegistrationAutoDiscovery = BaseTarget &{
    installType: 'pm';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

/**
 * BzeroTestTarget represents a bzero test target using an agent installed via
 * linux package manager
 */
export type BzeroTestTarget = BaseTarget & {
    installType: 'pm-bzero';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

// Hold our common TestRails caseIds
interface BaseTarget {
    sshCaseId?: string // For our ssh test suite
    badSshCaseId?: string // For our ssh test negation test
    connectCaseId?: string; // For our connect test suite
    closeCaseId?: string; // For our close test suite
    groupConnectCaseId?: string; // For our group based connect
    badConnectCaseId?: string; // for our connect negation test
    dbCaseId?: string; // For our db test suite
    badDbCaseId?: string // For out db negation negation test
    webCaseId?: string; // For our web test suite
    badWebCaseId?: string; // For out web negation tests
    sessionRecordingCaseId?: string;
}

export type TestTarget = SSMTestTargetAutoDiscovery | SSMTestTargetSelfRegistrationAutoDiscovery | SSMTestTargetAnsibleAutoDiscovery | BzeroTestTarget
