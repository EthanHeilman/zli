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
};

/**
 * SSMTestTargetAutoDiscovery represents an SSM test target that should be
 * registered using the ansible script retrieved from the backend.
 */
export type SSMTestTargetAnsibleAutoDiscovery = BaseTarget & {
    installType: 'as';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
};

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
};

/**
 * BzeroTestTarget represents a bzero test target using an agent installed via
 * linux package manager
 */
export type BzeroTestTarget = BaseTarget & {
    installType: 'pm-bzero';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
};

/**
 * BzeroTestTargetBashAutoDiscovery represents a bzero test target that should be
 * registered using the bash autodiscovery script that is retrieved from the back end.
 */
export type BzeroTestTargetBashAutoDiscovery = BaseTarget & {
    installType: 'ad-bzero';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
};

// Hold our common TestRails caseIds
interface BaseTarget {
    sshCaseId?: string // Zli - Ssh - Successful remote command execution
    sshWithEnvCaseId?: string // Zli - Ssh - Successful remote command execution with environment
    sshByUuidCaseId?: string // Zli - Ssh - Ssh by id instead of name
    sshBadUserCaseId?: string // Zli - Ssh - Cannot tunnel as invalid user
    sshConnectFailsCaseId?: string // Zli - Ssh - Connect fails with only tunnel policy
    sshTunnelFailsCaseId?: string // Zli - Ssh - Tunnel fails with only FUD policy
    sshScpCaseId?: string // Zli - Ssh - Successful scp of ordinary file
    sshSftpCaseId?: string // for Ssh SFTP tests
    sshScpByUuidCaseId?: string // Zli - Ssh - Scp with id instead of name
    connectCaseId?: string; // For our connect test suite
    closeCaseId?: string; // For our close test suite
    attachCaseId?: string; //  For our attach test suite
    groupConnectCaseId?: string; // For our group based connect
    badConnectCaseId?: string; // for our connect negation test
    iperfUpload?: string; // For our iperf upload suite
    iperfDownload?: string; // For our iperf download suite
    webCaseId?: string; // For our web test suite
    badWebCaseId?: string; // For out web negation tests
    sessionRecordingCaseId?: string;
}

export type TestTarget = SSMTestTargetAutoDiscovery | SSMTestTargetSelfRegistrationAutoDiscovery | SSMTestTargetAnsibleAutoDiscovery | BzeroTestTarget | BzeroTestTargetBashAutoDiscovery;
