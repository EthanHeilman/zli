import { configService, testCluster } from 'system-tests/tests/system-test';
import { callZli } from 'system-tests/tests/utils/zli-utils';
import { bzeroTestTargetsToRun } from 'system-tests/tests/targets-to-run';
import { TestTarget } from 'system-tests/tests/system-test.types';
import { getTargetInfo } from 'system-tests/tests/utils/ssh-utils';
import { S3 } from 'aws-sdk';
import { Logger } from 'services/logger/logger.service';
import { sleepTimeout } from 'system-tests/tests/utils/test-utils';

const s3 = new S3();

async function getAllKeys(params: any,  allKeys: string[]) {
    const response = await s3.listObjectsV2(params).promise();
    response.Contents.forEach(obj => allKeys.push(obj.Key));

    if (response.NextContinuationToken) {
        params.ContinuationToken = response.NextContinuationToken;
        await getAllKeys(params, allKeys);
    }
    return allKeys;
}

export const sendLogsSuite = () => {
    let month: string;
    let subjectEmail: string;
    let emailDomain: string;
    let bucket: string;

    describe('Send Logs Suite', () => {
        beforeAll(async () => {
            // get full current month name for object prefix
            month = new Date().toLocaleString('default', { month: 'long' }) ;

            // get subjectEmail for object prefix
            subjectEmail = (await configService.me()).email;

            // extract domain name from the email for object prefix
            const startIndex = subjectEmail.indexOf('@');
            const endIndex = subjectEmail.indexOf('.', startIndex);
            emailDomain = subjectEmail.substring(startIndex + 1, endIndex);

            // build the bucket name
            bucket = `bastionzero-${configService.getConfigName()}-customer-logs`;
        });

        afterEach(async () => {
            jest.clearAllMocks();
        }, 15 * 1000);

        // test successfully sending zli and daemon logs only
        it('382474: Send zli and daemon logs only', async () => {
            const loggerSpy = jest.spyOn(Logger.prototype, 'info');
            // call the zli command to send zli and daemon logs to S3
            await callZli(['send-logs']);

            expect(loggerSpy).toHaveBeenCalled();
            const outputArgs = loggerSpy.mock.calls[2][0];
            const generatedUuid = outputArgs.slice(36);

            // Waiting 10 seconds for bastion to upload the logs before querying
            await sleepTimeout(10 * 1000);

            const objectPrefix = `${month}/${emailDomain}/${subjectEmail}/${generatedUuid}/`;

            const opts = { Bucket: bucket, Prefix: objectPrefix };
            const allKeys = await getAllKeys(opts, []);

            if(allKeys.length != 1) {
                throw new Error(`Found ${allKeys.length} logs in s3 bucket ${bucket} with prefix: ${objectPrefix}`);
            }

            const objectKey = allKeys[0];
            const logType = 'zlidaemon.zip';
            expect(objectKey).toContain(generatedUuid);
            expect(objectKey).toContain(logType);

        }, 60 * 1000);

        // test successfully sending bzero agent logs only to BZ
        bzeroTestTargetsToRun.forEach(async (testTarget: TestTarget) =>{
            it(`${testTarget.sendLogsCaseId}: Send bzero agent logs only - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                const loggerSpy = jest.spyOn(Logger.prototype, 'info');
                const { targetName } = await getTargetInfo(testTarget);
                // call the zli command to send bzero agent logs to S3
                await callZli(['send-logs', '--target', targetName]);

                expect(loggerSpy).toHaveBeenCalled();
                const outputArgs = loggerSpy.mock.calls[2][0];
                const generatedUuid = outputArgs.slice(36);

                // Waiting 10 seconds for agent to post the logs before querying
                await sleepTimeout(10 * 1000);

                const objectPrefix = `${month}/${emailDomain}/${subjectEmail}/${generatedUuid}/`;

                const opts = { Bucket: bucket, Prefix: objectPrefix };
                const allKeys = await getAllKeys(opts, []);

                if(allKeys.length != 1) {
                    throw new Error(`Found ${allKeys.length} logs in s3 bucket ${bucket} with prefix: ${objectPrefix}`);
                }

                const objectKey = allKeys[0];
                const logType = 'agent.zip';
                expect(objectKey).toContain(generatedUuid);
                expect(objectKey).toContain(logType);

            }, 60 * 1000);
        });

        // test successfully sending kube agent logs only to BZ
        it('432716: Send cluster agent logs only', async () => {
            const loggerSpy = jest.spyOn(Logger.prototype, 'info');

            // call the zli command to send cluster agent logs to S3
            await callZli(['send-logs', '--target', testCluster.bzeroClusterTargetSummary.name]);

            expect(loggerSpy).toHaveBeenCalled();
            const outputArgs = loggerSpy.mock.calls[2][0];
            const generatedUuid = outputArgs.slice(36);

            // Waiting 10 seconds for agent to post the logs before querying
            await sleepTimeout(10 * 1000);

            const objectPrefix = `${month}/${emailDomain}/${subjectEmail}/${generatedUuid}/`;

            const opts = { Bucket: bucket, Prefix: objectPrefix };
            const allKeys = await getAllKeys(opts, []);

            if(allKeys.length != 1) {
                throw new Error(`Found ${allKeys.length} logs in s3 bucket ${bucket} with prefix: ${objectPrefix}`);
            }

            const objectKey = allKeys[0];
            const logType = 'agent.zip';
            expect(objectKey).toContain(generatedUuid);
            expect(objectKey).toContain(logType);

        }, 60 * 1000);
    });
};
