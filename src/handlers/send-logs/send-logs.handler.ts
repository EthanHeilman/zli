import fs from 'fs';
import AdmZip from 'adm-zip';
import yargs from 'yargs';
import { randomUUID } from 'crypto';
import { ConfigService } from '../../services/config/config.service';
import { ParsedTargetString } from '../../services/common.types';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { UploadLogArchiveHttpService } from '../../http-services/upload-logs/upload-log-archive.http-service';
import { BzeroTargetHttpService } from '../../http-services/targets/bzero/bzero.http-services';
import { sendLogsArgs } from './send-logs.command-builder';
import { parseTargetString } from '../../utils/utils';
import { LoggerConfigService } from '../../services/logger/logger-config.service';

export function getDates() {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // zli timestamp is formatted 2006-01-01
    const todayZli = today.toISOString().slice(0, 10);
    const yesterdayZli = yesterday.toISOString().slice(0, 10);

    // daemon timestamp is formatted Jan  1
    let todayDaemon = today.toDateString().slice(4, 10);
    let yesterdayDaemon = yesterday.toDateString().slice(4, 10);

    // ex: need to remove 0 from Jan 01 to get proper daemon log format
    if(todayDaemon[4] === '0') {
        todayDaemon = todayDaemon.replace('0', ' ');
    }
    if(yesterdayDaemon[4] === '0') {
        yesterdayDaemon = yesterdayDaemon.replace('0', ' ');
    }

    return { todayZli, yesterdayZli, todayDaemon, yesterdayDaemon };
}

async function getFilteredLogContents(logger: Logger, zliLogFilePath: string, daemonLogFilePath: string) {
    let zliLogContents: string[];
    let daemonLogContents: string[];
    try {
        zliLogContents = fs.readFileSync(zliLogFilePath, 'utf-8').split('\n');
    } catch (err) {
        logger.error('Error reading local zli log files');
        await cleanExit(1, logger);
    }

    try {
        daemonLogContents = fs.readFileSync(daemonLogFilePath, 'utf-8').split('\n');
    } catch (err) {
        logger.error('Error reading local daemon log files');
        await cleanExit(1, logger);
    }

    // get current date and previous date in appropriate formats
    const { todayZli, yesterdayZli, todayDaemon, yesterdayDaemon } = getDates();

    // filter out all logs not produced on the current or previous date
    // reduces the size of the payload being posted
    const filteredZliContents = zliLogContents.filter((log) => {
        return (log.includes(todayZli) || log.includes(yesterdayZli));
    });
    const filteredDaemonContents = daemonLogContents.filter((log) => {
        return (log.includes(todayDaemon) || log.includes(yesterdayDaemon));
    });

    return { todayZli, filteredZliContents, filteredDaemonContents };
}

export async function sendLogsHandler(argv: yargs.Arguments<sendLogsArgs>, configService: ConfigService, loggerConfigService: LoggerConfigService, logger: Logger) {
    // generate random guid which will map to the folder name
    // folder will contain all logs sent via this handler
    const uploadLogsRequestId = randomUUID();
    let agentLogsSent = false;
    let zlidaemonLogsSent = false;

    // if either of these are specified then trigger agent logs
    if(argv.target || argv.all) {
        let parsedTarget: ParsedTargetString;
        if(argv.target) {
            parsedTarget = parseTargetString(argv.target);
        } else {
            parsedTarget = parseTargetString(argv.all);
        }

        const bzeroTargetService = new BzeroTargetHttpService(configService, logger);

        try {
            await bzeroTargetService.RetrieveAgentLogs({
                targetName: parsedTarget.name,
                targetId: parsedTarget.id,
                envId: parsedTarget.envId,
                envName: parsedTarget.envName,
                uploadLogsRequestId: uploadLogsRequestId
            });
            logger.info(`Requesting ${parsedTarget.name} to send target logs to BastionZero!`);
            agentLogsSent = true;
        } catch (error) {
            logger.error(error);
        }
    }

    // if the target flag is undefined then we will send zli and daemon logs
    // target flag indicates only agent logs will be sent to S3
    if(argv.target === undefined) {
        const uploadLogsHttpService = new UploadLogArchiveHttpService(configService, logger);
        const bzLoggerFolderPath = loggerConfigService.configDir();

        const zliLogPath = loggerConfigService.logPath();
        const daemonLogPath = loggerConfigService.daemonLogPath();
        const { todayZli, filteredZliContents, filteredDaemonContents } = await getFilteredLogContents(logger, zliLogPath, daemonLogPath);

        const tempZliFilePath = `${bzLoggerFolderPath}/bastionzero-zli-${uploadLogsRequestId}-${todayZli}.log`;
        const tempDaemonFilePath = `${bzLoggerFolderPath}/bastionzero-daemon-${uploadLogsRequestId}-${todayZli}.log`;
        const tempZipFilePath = `${bzLoggerFolderPath}/log-archive-${uploadLogsRequestId}.zip`;

        // write the filtered logs into temporary files
        try {
            fs.writeFileSync(tempZliFilePath, filteredZliContents.join('\n'));
            fs.writeFileSync(tempDaemonFilePath, filteredDaemonContents.join('\n'));
        } catch(err) {
            logger.error(`Error writing content to temporary log files: ${err}`);
            await cleanExit(1, logger);
        }

        // zip the temporary zli and daemon log files
        const zip = new AdmZip();
        zip.addLocalFile(tempZliFilePath);
        zip.addLocalFile(tempDaemonFilePath);
        zip.writeZip(tempZipFilePath);

        // create a ReadStream from the zip file
        let readStream;
        try {
            readStream = fs.createReadStream(tempZipFilePath);
        } catch(err) {
            logger.error(`Error creating read stream from the zip file: ${err}`);
            await cleanExit(1, logger);
        }

        // post zli and daemon logs directly to UploadLogArchiveController
        try {
            await uploadLogsHttpService.UploadLogArchive({
                userEmail: configService.me().email,
                uploadLogsRequestId: uploadLogsRequestId,
                logArchiveZip: readStream,
            });

            logger.info('Zli and daemon logs have been sent to BastionZero!');
            zlidaemonLogsSent = true;
        } catch(err) {
            logger.error(err);
        }

        // delete the temporary files
        try {
            fs.unlinkSync(tempZliFilePath);
            fs.unlinkSync(tempDaemonFilePath);
            fs.unlinkSync(tempZipFilePath);
        } catch(err) {
            logger.warn(`Error deleting temporary files: ${err}`);
        }
    }

    if(agentLogsSent || zlidaemonLogsSent) {
        logger.info(`Unique identifier for this request: ${uploadLogsRequestId}`);
    }
    await cleanExit(0, logger);
}
