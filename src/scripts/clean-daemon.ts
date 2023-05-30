import path from 'path';
import fs from 'fs';

import { ConfigService } from 'services/config/config.service';
import { envMap } from 'cli-driver';
import { Logger } from 'services/logger/logger.service';
import { LoggerConfigService } from 'services/logger/logger-config.service';
import { getDaemonExecutablePaths } from 'utils/daemon-utils';

// Standalone script that deletes existing daemon executables in the zli config
// directory which is callable from npm scripts within package.json. The reason
// for this script is that during development when we recompile the daemon (i.e
// run `npm run release`) we can also remove any currently existing daemon
// executables in the zli config directory so that the zli will copy this newly
// compiled daemon executable instead of reusing the old one

// Construct a ConfigService so we can get the config directory the same way the
// zli does while also respecting any env variable overrides
export const loggerConfigService = new LoggerConfigService(envMap.configName, false, envMap.configDir);
export const logger = new Logger(loggerConfigService, false, false, true);
const configService = new ConfigService(envMap.configName, logger, envMap.configDir, false);
const configDir = path.dirname(configService.getConfigPath());

// Construct the final daemon path the same way the zli does so we can remove
// the daemon executable
const [_, finalDaemonPath] = getDaemonExecutablePaths(configDir);
if (fs.existsSync(finalDaemonPath)) {
    logger.info(`Removing daemon executable at ${finalDaemonPath}`);
    fs.rmSync(finalDaemonPath);
}

process.exit(0);