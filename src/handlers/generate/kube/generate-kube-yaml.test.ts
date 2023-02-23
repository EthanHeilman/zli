import fs from 'fs';
import path from 'path';
import mockArgv from 'mock-argv';
import { CliDriver } from '../../../cli-driver';
import { cleanConsoleLog, createTempDirectory, deleteDirectory, mockEnv, unitTestMockSetup } from '../../../utils/unit-test-utils';
import { KubeHttpService } from '../../../http-services/targets/kube/kube.http-services';
import * as CleanExitHandler from '../../clean-exit.handler';
import * as KubeYamlMocks from './generate-kube-yaml.mock';

describe('Generate kube yaml suite', () => {
    let createNewAgentTokenSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;
    // For --outputFile
    const tempDir = path.join(__dirname, 'temp-yaml-test');

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Set up necessary mocks
        unitTestMockSetup(false);
        KubeYamlMocks.kubeYamlMockSetup();

        // Mock createNewAgentToken to return our mockKubeYaml
        createNewAgentTokenSpy = jest.spyOn(KubeHttpService.prototype, 'CreateNewAgentToken').mockImplementation(async () => Promise.resolve(KubeYamlMocks.mockKubeYaml));
        // Listen to our generate kube config response
        logSpy = jest.spyOn(console, 'log');
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    afterAll(() => {
        deleteDirectory(tempDir);
    });

    test('31629: Error when generating kube yaml without clusterName', async () => {
        // Mock cleanExit
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async () => Promise.reject(Error('some-err')));

        // Call the function
        let err = undefined;
        try {
            await mockArgv(['generate', 'kubeYaml'], async () => {
                const driver = new CliDriver();
                await driver.run(process.argv.slice(2), true);
            });
        } catch (e) {
            err = e;
        }

        expect(err).toBeDefined();
        expect(cleanExitSpy).toHaveBeenCalledWith(1, expect.anything());
    });

    test('31658: Generate kube yaml with testcluster as clusterName', async () => {
        // Mock cleanExit
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());

        // Call the function
        await mockArgv(['generate', 'kubeYaml', 'testcluster'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        expect(createNewAgentTokenSpy).toHaveBeenCalledWith('testcluster', {}, '', null);
        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(KubeYamlMocks.mockKubeYaml.yaml);
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());
    });

    test('31659: Generate kube yaml with --environmentName option', async () => {
        // Mock cleanExit
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());

        // Call the function
        await mockArgv(['generate', 'kubeYaml', 'testcluster', '--environmentName=test-env-name'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        expect(createNewAgentTokenSpy).toHaveBeenCalledWith('testcluster', {}, '', mockEnv.id);
        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(KubeYamlMocks.mockKubeYaml.yaml);
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());
    });

    test('31660: Generate kube yaml with --outputFile option', async () => {
        // Mock cleanExit
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());

        // Create outputFile to write to
        const outputFile = path.join(tempDir, 'test-file');
        createTempDirectory(tempDir, [outputFile], ['']);

        // Call the function
        await mockArgv(['generate', 'kubeYaml', 'testcluster', `--outputFile=${outputFile}`], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        const outputFileContents = fs.readFileSync(outputFile, 'utf8');

        expect(createNewAgentTokenSpy).toHaveBeenCalledWith('testcluster', {}, '', null);
        expect(outputFileContents).toEqual(KubeYamlMocks.mockKubeYaml.yaml);
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());
    });

    test('31661: Generate kube yaml with --namespace option', async () => {
        // Mock cleanExit
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());

        // Call the function
        await mockArgv(['generate', 'kubeYaml', 'testcluster', '--namespace=test-namespace'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        expect(createNewAgentTokenSpy).toHaveBeenCalledWith('testcluster', {}, 'test-namespace', null);
        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(KubeYamlMocks.mockKubeYaml.yaml);
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());
    });

    test('31662: Generate kube yaml with --labels option', async () => {
        // Mock cleanExit
        const cleanExitSpy = jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(() => Promise.resolve());

        // Call the function
        await mockArgv(['generate', 'kubeYaml', 'testcluster', '--labels=testkey0:testvalue0', 'testkey1:testvalue1'], async () => {
            const driver = new CliDriver();
            await driver.run(process.argv.slice(2), true);
        });

        expect(createNewAgentTokenSpy).toHaveBeenCalledWith('testcluster', { testkey0: 'testvalue0', testkey1: 'testvalue1' }, '', null);
        const outputArgs = logSpy.mock.calls[0][0];
        const cleanOutput = cleanConsoleLog(outputArgs);
        expect(cleanOutput).toEqual(KubeYamlMocks.mockKubeYaml.yaml);
        expect(cleanExitSpy).toHaveBeenCalledWith(0, expect.anything());
    });
});