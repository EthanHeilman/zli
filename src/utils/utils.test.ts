import { parseTargetString, parseTargetType } from './utils';

describe('Utils suite', () => {
    test('2489: valid targetType strings', () => {
        const validSSMTargetTypeStrings = [
            'ssmtarget',
            'SSMtarget',
            'sSMtarget'
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
            '97d4d916-33f8-478e-9e6c-1091662ccaf0:asdfjl; asdfla;sd'
        ];
        validSSMTargetStrings.forEach(t => expect(parseTargetString(t)).toBeDefined());
    });

    test('2492: invalid targetStrings', () => {
        const invalidSSMTargetStrings = [
            'ssm$-user@neat-test',  // invalid unix username, $ wrong place
            'ss..er@neat-test:/hello', // invalid characters in unix username
            'ssm-user@:97d4d916-33f8-478e-9e6c-1091662ccaf0', // colon wrong place
            'ss!!!r@whatsUp!Word:/cool' // invalid character in target name
        ];
        invalidSSMTargetStrings.forEach(t => expect(parseTargetString(t)).toBeUndefined());
    });
});