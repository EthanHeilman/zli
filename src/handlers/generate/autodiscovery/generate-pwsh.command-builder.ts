import yargs from 'yargs';

const targetNameSchemes = ['time', 'aws', 'hostname'] as const;
type TargetNameScheme = typeof targetNameSchemes[number];

export type generatePwshArgs = { environment: string } &
{ targetNameScheme: TargetNameScheme } &
{ outputFile: string } &
{ beta: boolean };

export function generatePwshCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<generatePwshArgs> {
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
        .example('generate powershell --targetNameScheme time', '')
        .example('generate powershell -o script.ps1', 'Writes the script to a file "script.ps1" in the current directory');
}