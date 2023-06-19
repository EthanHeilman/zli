import yargs from 'yargs';

const targetNameSchemes = ['do', 'aws', 'time', 'hostname'] as const;
type TargetNameScheme = typeof targetNameSchemes[number];

export type generateBashArgs = { environment: string } &
{ targetNameScheme: TargetNameScheme } &
{ outputFile: string } &
{ beta: boolean };

export function generateBashCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<generateBashArgs> {
    return yargs
        .option(
            'environment',
            {
                type: 'string',
                demandOption: false,
                alias: 'e',
                default: 'Default',
                describe: 'Specifies the target\'s environment',
            }
        )
        .option(
            'targetNameScheme',
            {
                demandOption: false,
                choices: targetNameSchemes,
                default: 'hostname' as TargetNameScheme,
                conflicts: 'targetName',
                describe: 'Configures the target name. Defaults to using the hostname of the target.',
            }
        )
        .option(
            'outputFile',
            {
                type: 'string',
                demandOption: false,
                alias: 'o',
                describe: 'Write the script to a file'
            }
        )
        .option(
            'beta',
            {
                type: 'boolean',
                demandOption: false,
                default: false,
                describe: 'If set, use the latest beta release of the BastionZero agent. Otherwise, use the latest production release'
            }
        )
        .example('generate bash --targetNameScheme time', '')
        .example('generate bash -o script.sh', 'Writes the script to a file "script.sh" in the current directory');
}