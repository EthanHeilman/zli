import { parseTargetString, parseTargetType } from 'utils/utils';

describe('Utils suite', () => {
    test('2489: valid targetType strings', () => {
        const validSSMTargetTypeStrings = [
            'ssm',
            'SSM',
            'sSM'
        ];
        validSSMTargetTypeStrings.forEach(t => expect(parseTargetType(t)).toBeDefined());
    });

    test('2490: invalid targetType strings', () => {
        const invalidSSMTargetTypeStrings = [
            '123123',
            'ssmA', // too long
            'sssm', // too long
            'SSHssm',
            'SuSHiMi', // SSH and SSM embedded
            'mss'
        ];
        invalidSSMTargetTypeStrings.forEach(t => expect(parseTargetType(t)).toBeUndefined());
    });

    test('2491: valid targetStrings', () => {
        const validSSMTargetStrings = [
            'ssm-user@neat-test',
            '_ssm-user@coolBeans',
            'ssm-user$@97d4d916-33f8-478e-9e6c-1091662ccaf0', // valid $ in unixname
            'ssm-user@neat-test:/hello', // valid path
            'ssm-user@coolBeans:::', // everything after first colon ignored
            'ssm-user@97d4d916-33f8-478e-9e6c-1091662ccaf0:asdfjl; asdfla;sd',
            '97d4d916-33f8-478e-9e6c-1091662ccaf0:asdfjl; asdfla;sd',
            'target_name.test-env-name'
        ];
        validSSMTargetStrings.forEach(t => expect(parseTargetString(t)).toBeDefined());

        // testing target string that includes getting target by targetName and environmentId
        const targetByEnvId = 'target_name.97d4d916-33f8-478e-9e6c-1091662ccaf0';
        let targetStringParsed = parseTargetString(targetByEnvId);
        // target id and envName should be undefined bc using target name and envId
        expect(targetStringParsed.id).toBeUndefined();
        expect(targetStringParsed.envName).toBeUndefined();
        // target name and envId should be filled with the appropriate values
        expect(targetStringParsed.name).toBe('target_name');
        expect(targetStringParsed.envId).toBe('97d4d916-33f8-478e-9e6c-1091662ccaf0');

        // testing target string that includes getting target by targetName and environmentName
        const targetByEnvName = 'target_name.test_environment_name';
        targetStringParsed = parseTargetString(targetByEnvName);
        // target id and envId should be undefined bc using target name and envName
        expect(targetStringParsed.id).toBeUndefined();
        expect(targetStringParsed.envId).toBeUndefined();
        // target name and envName should be filled with the appropriate values
        expect(targetStringParsed.name).toBe('target_name');
        expect(targetStringParsed.envName).toBe('test_environment_name');

        // when specifying environment name we should split the string on the first '.'
        // the first period separates the target name and the environment name
        const targetByEnvNameWithPeriods = 'target.name.test.environment.name';
        targetStringParsed = parseTargetString(targetByEnvNameWithPeriods);
        // target id and envId should be undefined bc using target name and environment name
        expect(targetStringParsed.id).toBeUndefined();
        expect(targetStringParsed.envId).toBeUndefined();
        // target name should be unaffected
        expect(targetStringParsed.name).toBe('target');
        // environment name was incorrectly formatted, so should be undefined
        // a message will be displayed for the user to use environment ID
        expect(targetStringParsed.envName).toBe('name.test.environment.name');


        // Test a GCP Cloud SQL targetstring where
        //  aliceservacc@ethandbtest.iam.gserviceaccount.com - is an GCP service username
        //  gcp-psql - is the bastionzero target alias
        const targetWithGCPUser = 'aliceservacc@ethandbtest.iam.gserviceaccount.com@gcp-pgres';
        targetStringParsed = parseTargetString(targetWithGCPUser);
        // target id and envId should be undefined bc using target name and no environment
        expect(targetStringParsed.id).toBeUndefined();
        expect(targetStringParsed.envId).toBeUndefined();
        // target name should be unaffected
        expect(targetStringParsed.user).toBe('aliceservacc@ethandbtest.iam.gserviceaccount.com');
        expect(targetStringParsed.name).toBe('gcp-pgres');
    });

    test('2492: invalid targetStrings', () => {
        const invalidSSMTargetStrings = [
            'ssm-user@:97d4d916-33f8-478e-9e6c-1091662ccaf0', // colon wrong place
        ];
        invalidSSMTargetStrings.forEach(t => expect(parseTargetString(t)).toBeUndefined());
    });
});