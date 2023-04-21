import fs from 'fs';
import path from 'path';
import readline from 'readline';
import util from 'util';

import yargs from 'yargs';
import { SemVer, lt, parse } from 'semver';

import { DbTargetHttpService } from '../../../http-services/db-target/db-target.http-service';
import { CertificateHttpService } from '../../../http-services/certificate/certificate.http-service';
import { ConfigService } from '../../../services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { generateCertificateArgs } from './generate-certificate.command-builder';
import { isGuid } from '../../../utils/utils';
import { cleanExit } from '../../../handlers/clean-exit.handler';
import { DbTargetSummary } from '../../../../webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { TargetStatus } from '../../../../webshell-common-ts/http/v2/target/types/targetStatus.types';

const minimumAgentVersion = '7.4.0';

export const paths = {
    caCert: 'ca.crt',
    serverCert: 'server.crt',
    serverKey: 'server.key',
    agentKeyShard: 'agent-key-shard.json',
};

export async function certificateHandler(argv: yargs.Arguments<generateCertificateArgs>, configService: ConfigService, logger: Logger) {
    if (argv.targets.length == 0 && !argv.all) {
        logger.error(`No targets provided and 'all' flag not set. Please run 'zli generate certificate --help'`);
        await cleanExit(1, logger);
    }

    // validate output directory if provided
    let makeOutputDir = false;
    let outputDir = argv.outputDir;
    if (outputDir) {
        const outputDirExists = await util.promisify(fs.exists)(outputDir);
        if (!outputDirExists) {
            logger.error(`outputDir '${outputDir}' does not exist`);
            await cleanExit(1, logger);
        }
        else {
            const fileStat = await util.promisify(fs.lstat)(outputDir);
            if (!fileStat.isDirectory()) {
                logger.error(`path '${outputDir}' is not a directory`);
                await cleanExit(1, logger);
            }
        }
        try {
            await util.promisify(fs.access)(outputDir, fs.constants.W_OK);
        } catch (err) {
            logger.error(`you do not have permission to write to path '${argv.outputDir}'`);
            await cleanExit(1, logger);
        }
    } else {
        outputDir = newUniqueOutputDir();
        makeOutputDir = true;
    }

    let usingTargetIds = false;
    let targetIds: string[] = [];
    let targetNames: string[] = [];

    if (argv.targets.length > 0) {
        if (isGuid(argv.targets[0])) {
            usingTargetIds = true;
            targetIds = argv.targets;
        } else {
            targetNames = argv.targets;
        }
    }

    // Guid validation
    if (usingTargetIds) {
        const failures: string[] = [];
        targetIds.forEach((targetId) => {
            if (!isGuid(targetId)) {
                failures.push(targetId);
            }
        });

        logger.error(`You must provide either a list of target IDs or of target names. The following are not valid target IDs: ${failures.join(', ')}`);
        await cleanExit(1, logger);
    }

    let envId: string;
    let envName: string;

    if (isGuid(argv.environment)) {
        envId = argv.environment;
    } else if (argv.environment != null) {
        envName = argv.environment;
    }

    const dbTargetService = new DbTargetHttpService(configService, logger);
    let dbTargetsToConfigure: DbTargetSummary[] = [];
    let errorText = '';

    if (argv.all) {
        // if the user asked for all, we show them any potential errors and let them decide whether to continue
        const dbTargets = await dbTargetService.ListDbTargets();

        [dbTargetsToConfigure, errorText] = validateDbTargets(dbTargets);

        // if there are no valid targets, there's nothing we can do
        if (dbTargetsToConfigure.length == 0) {
            logger.error(`The 'all' flag was provided but you do not have any database targets that are online and have an agent version >= ${minimumAgentVersion}`);
            if (errorText.length > 0) {
                logger.error(`The following targets could not be configured: ${errorText}`);
            }
            await cleanExit(1, logger);
        }

        // however, there might be a mix of valid and invalid targets
        if (errorText.length > 0) {
            logger.warn(`The 'all' flag was provided but the following database targets cannot be configured for SplitCert access: ${errorText}
Valid targets: ${dbTargetsToConfigure.map(t => t.name).join(', ')}`);

            if (!argv.yes) {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                const answer: string = await new Promise(resolve => {
                    rl.question(`Would you like to continue and configure the valid targets only? [y/N] `, resolve);
                });
                switch (answer.toLowerCase()) {
                case 'y':
                    break;
                default:
                    logger.warn(`Aborting certificate generation`);
                    await cleanExit(1, logger);
                }
                rl.close();
            }
        }
    } else {
        // if we didn't get back as many targets as we explicitly asked for, fail
        const dbTargets = await dbTargetService.GetDbTargets(targetNames, targetIds, envName, envId);
        if (usingTargetIds) {
            if (dbTargets.length !== targetIds.length) {
                const failures: string[] = [];
                targetIds.forEach((targetId) => {
                    if (!dbTargets.find(t => t.id == targetId)) {
                        failures.push(targetId);
                    }
                });
                logger.error(`The following targets could not be found by ID: ${failures.join(', ')}`);
                await cleanExit(1, logger);
            }
        } else {
            if (dbTargets.length !== targetNames.length) {
                const failures: string[] = [];
                targetNames.forEach((targetName) => {
                    if (!dbTargets.find(t => t.name == targetName)) {
                        failures.push(targetName);
                    }
                });
                logger.error(`The following targets could not be found by name: ${failures.join(', ')}`);
                await cleanExit(1, logger);
            }
        }

        // if any of the targets we explicitly asked for are unavailable, fail
        [dbTargetsToConfigure, errorText] = validateDbTargets(dbTargets);
        if (errorText.length > 0) {
            logger.error(errorText);
            await cleanExit(1, logger);
        }
    }

    const certificateService = new CertificateHttpService(configService, logger);
    const certResponse = await certificateService.GenerateCertificate({
        targetIds: dbTargetsToConfigure.map(t => t.id),
        selfHosted: argv.selfHosted,
    });

    const options: fs.WriteFileOptions = {
        mode: 0o600,
    };

    let agentTargetString = '';
    certResponse.agentTargets.forEach((summary) => {
        agentTargetString += `Bzero target: ${summary.name} (env ${summary.envId})\n  - Database targets: ${summary.dbTargets.join(', ')}\n`;
    });

    logger.info(`Successfully generated CA certificate and sent private keyshards to the following targets:\n\n${agentTargetString}
CA certificate saved to ${path.join(outputDir, paths.caCert)}`);

    // save all required output locally
    if (makeOutputDir) {
        await util.promisify(fs.mkdir)(outputDir);
    }
    await util.promisify(fs.writeFile)(path.join(outputDir, paths.caCert), certResponse.caCert, options);

    if (argv.selfHosted) {
        await util.promisify(fs.writeFile)(path.join(outputDir, paths.serverCert), certResponse.serverCert);
        logger.info(`Server certificate saved to ${path.join(outputDir, paths.serverCert)}`);
        await util.promisify(fs.writeFile)(path.join(outputDir, paths.serverKey), certResponse.serverKey);
        logger.info(`Server private key saved to ${path.join(outputDir, paths.serverKey)}`);
    }

    if (argv.agentKey) {
        await util.promisify(fs.writeFile)(path.join(outputDir, paths.agentKeyShard), JSON.stringify(certResponse.keyShardData, null, 4), options);
        logger.info(`Agent keyshard data saved to ${path.join(outputDir, paths.agentKeyShard)}`);
        logger.info(`For more information on what to do with this keyshard data, see https://docs.bastionzero.com/`);
    }
}

function newUniqueOutputDir(): string {
    return `bzero_splitCert_${(new Date().toJSON().slice(0, 23))}`;
}

function validateDbTargets(targets: DbTargetSummary[]): [DbTargetSummary[], string] {
    const result: DbTargetSummary[] = [];
    let errorText = '';

    targets.forEach((target: DbTargetSummary) => {
        const agentVersion = parse(target.agentVersion.replace('-beta', ''));
        if (agentVersion && lt(agentVersion, new SemVer(minimumAgentVersion))) {
            errorText += `\nTarget '${target.name}' (env ${target.environmentId}) uses a proxy agent whose version does not support SplitCert access. Current version: ${target.agentVersion}, Required version: ${minimumAgentVersion}.`;
        } else if (target.status != TargetStatus.Online) {
            errorText += `\nTarget '${target.name}' (env ${target.environmentId}) is not online.`;
        } else {
            result.push(target);
        }
    });

    return [result, errorText];
}