import yargs from 'yargs';

export type addGcpProjectArgs = {id: string}

export function addGcpProjectCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<addGcpProjectArgs>
{
    return yargs
        .option(
            'id',
            {
                type: 'string',
                demandOption: true,
                alias: 'p'
            }
        )
        .example('$0 --add-gcp-project-id --id exampleprojectid.iam.gserviceaccount.com', 'Add a new GCP service account project id');
}