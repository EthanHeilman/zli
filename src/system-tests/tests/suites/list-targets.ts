import { systemTestEnvId, testCluster, testTargets } from 'system-tests/tests/system-test';
import * as ListTargetsService from 'services/list-targets/list-targets.service';
import { getMockResultValue } from 'system-tests/tests/utils/jest-utils';
import { TargetSummary } from 'webshell-common-ts/http/v2/target/targetSummary.types';
import { callZli } from 'system-tests/tests/utils/zli-utils';
import { TargetType } from 'webshell-common-ts/http/v2/target/types/target.types';

export const listTargetsSuite = () => {
    describe('list targets suite', () => {

        test('2117: list-targets', async () => {
            const listTargetsSpy = jest.spyOn(ListTargetsService, 'listTargets');
            await callZli(['list-targets', '--json']);

            expect(listTargetsSpy).toHaveBeenCalledTimes(1);
            const returnedTargetSummaries = (await getMockResultValue(listTargetsSpy.mock.results[0]));
            const expectedTargetSummaries = [];

            const expectedBzeroTargetSummaries = Array.from(testTargets.values()).map<TargetSummary>(t => {
                if (t.type === 'linux') {
                    return {
                        type: TargetType.Linux,
                        agentPublicKey: t.bzeroTarget.agentPublicKey,
                        id: t.bzeroTarget.id,
                        name: t.bzeroTarget.name,
                        environmentId: systemTestEnvId,
                        agentVersion: t.bzeroTarget.agentVersion,
                        status: t.bzeroTarget.status,
                        targetUsers: expect.anything(),
                        region: t.bzeroTarget.region
                    };
                }
            });
            expectedTargetSummaries.push(...expectedBzeroTargetSummaries);

            if (testCluster) {
                expectedTargetSummaries.push({
                    type: TargetType.Kubernetes,
                    agentPublicKey: testCluster.bzeroClusterTargetSummary.agentPublicKey,
                    id: testCluster.bzeroClusterTargetSummary.id,
                    name: testCluster.bzeroClusterTargetSummary.name,
                    environmentId: testCluster.bzeroClusterTargetSummary.environmentId,
                    agentVersion: testCluster.bzeroClusterTargetSummary.agentVersion,
                    status: testCluster.bzeroClusterTargetSummary.status,
                    targetUsers: testCluster.bzeroClusterTargetSummary.allowedClusterUsers,
                    region: testCluster.bzeroClusterTargetSummary.region
                });
            }

            for (const target of expectedTargetSummaries) {
                const foundObject = returnedTargetSummaries.find(t => t.id === target.id);

                if (foundObject) {
                    expect(target).toMatchObject(foundObject);
                } else {
                    throw new Error(`Failed to find target with id:${target.id}`);
                }
            }
        }, 30 * 1000);
    });
};