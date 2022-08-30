import { Logger } from '../../../services/logger/logger.service';
import { ConfigService } from '../../../services/config/config.service';
import { listTargets } from '../../../services/list-targets/list-targets.service';
import { ParsedTargetString } from '../../../services/common.types';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from '../../../../webshell-common-ts/http/v2/target/types/targetStatus.types';

// helper function that polls listTargets until a target goes offline and comes back online.
// If the target never changes state, this will time out in the context of a test
export async function waitForRestart(configService: ConfigService, logger: Logger, targetString: ParsedTargetString) {
    let goneOffline = false;
    let backOnline = false;

    // TODO: support other target notations
    while (!goneOffline) {
        const targets = await listTargets(configService, logger, [TargetType.Bzero]);
        const myTarget = targets.filter(target => target.name === targetString.name);
        if (myTarget.length !== 1) {
            throw new Error(`Expected 1 target but got ${myTarget.length}`);
        } else {
            goneOffline = myTarget[0].status === TargetStatus.Offline;
        }
    }

    console.log("Gone offline!")

    while (!backOnline) {
        const targets = await listTargets(configService, logger, [TargetType.Bzero]);
        const myTarget = targets.filter(target => target.name === targetString.name);
        if (myTarget.length !== 1) {
            throw new Error(`Expected 1 target but got ${myTarget.length}`);
        } else {
            backOnline = myTarget[0].status === TargetStatus.Online;
        }
    }
}