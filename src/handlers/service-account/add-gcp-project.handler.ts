import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { ServiceAccountHttpService } from '../../http-services/service-account/service-account.http-services';
import { addGcpProjectCmdBuilder } from '../../handlers/service-account/add-gcp-project.command-builder';
import { addGcpProjectArgs } from '../../handlers/service-account/add-gcp-project.command-builder';




export async function AddGcpProject(configService: ConfigService, logger: Logger, argv : yargs.Arguments<addGcpProjectArgs>) {

    const serviceAccountHttpService = new ServiceAccountHttpService(configService, logger);
    var encodedId = Buffer.from(argv.id).toString('base64');
    
    const createResp = await serviceAccountHttpService.AddGCPProject({id: encodedId});
    console.log("Added GCP project id: ", createResp);
}