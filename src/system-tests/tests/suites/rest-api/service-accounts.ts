import { ServiceAccountHttpService } from '../../../../../src/http-services/service-account/service-account.http-services';
import { configService, logger, RUN_AS_SERVICE_ACCOUNT, systemTestServiceAccount } from '../../system-test';
import { MfaHttpService } from '../../../../../src/http-services/mfa/mfa.http-services';
import { testIf } from '../../utils/utils';
import { ensureServiceAccountRole } from '../../system-test-setup';
import { SubjectHttpService } from '../../../../http-services/subject/subject.http-services';

export const serviceAccountRestApiSuite = () => {
    describe('Service Account REST API Suite', () => {
        let subjectHttpService: SubjectHttpService;
        let serviceAccountService: ServiceAccountHttpService;
        let mfaService: MfaHttpService;

        beforeAll(async () => {
            subjectHttpService = new SubjectHttpService(configService, logger);
            serviceAccountService = new ServiceAccountHttpService(configService, logger);
            mfaService = new MfaHttpService(configService, logger);

            if(RUN_AS_SERVICE_ACCOUNT) {
                // When running as a service account these tests assume the service account always an admin to begin with
                await ensureServiceAccountRole(subjectHttpService, true);
            } else {
                // When running as a user these tests assume the service account always is not an admin to begin with
                await ensureServiceAccountRole(subjectHttpService, false);
            }
        });

        test(`481488: Get a service account's data by ID`, async () => {
            const serviceAccountSummaryFromId = await serviceAccountService.GetServiceAccount(systemTestServiceAccount.id);
            expect(serviceAccountSummaryFromId).toEqual(systemTestServiceAccount);
        }, 15 * 1000);

        test(`481489: Get all service accounts' data`, async () => {
            const allServiceAccounts = await serviceAccountService.ListServiceAccounts();
            const foundServiceAccount = allServiceAccounts.find(sa => sa.id === systemTestServiceAccount.id);
            expect(foundServiceAccount).toEqual(systemTestServiceAccount);
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, `481490: Set role of service account as user`, async () => {
            const editedServiceAccount = await serviceAccountService.UpdateServiceAccount(systemTestServiceAccount.id, {isAdmin: true});
            expect(editedServiceAccount.isAdmin).toBeTrue();
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, `481491: Set role of service account as user - should fail to set role to existing value`, async () => {
            expect(() => serviceAccountService.UpdateServiceAccount(systemTestServiceAccount.id, {isAdmin: true})).rejects.toThrow();
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, `481492: Set status of service account as user`, async () => {
            const editedServiceAccount = await serviceAccountService.UpdateServiceAccount(systemTestServiceAccount.id, {enabled: false});
            expect(editedServiceAccount.enabled).toBeFalse();
        }, 15 * 1000);

        testIf(!RUN_AS_SERVICE_ACCOUNT, `481493: Set status of service account as user - should fail to set status to existing value`, async () => {
            expect(() => serviceAccountService.UpdateServiceAccount(systemTestServiceAccount.id, {enabled: false})).rejects.toThrow();
        }, 15 * 1000);

        testIf(RUN_AS_SERVICE_ACCOUNT, `481494: Set role of service account as service account - should fail to set role`, async () => {
            expect(() => serviceAccountService.UpdateServiceAccount(systemTestServiceAccount.id, {isAdmin: true})).rejects.toThrow();
        }, 15 * 1000);

        testIf(RUN_AS_SERVICE_ACCOUNT, `481495: Set status of service account as service account - should fail to set status`, async () => {
            expect(() => serviceAccountService.UpdateServiceAccount(systemTestServiceAccount.id, {enabled: false})).rejects.toThrow();
        }, 15 * 1000);

        testIf(RUN_AS_SERVICE_ACCOUNT, `481496: Rotate mfa service account as service account - should fail to rotate mfa`, async () => {
            expect(() => mfaService.RotateSecret(systemTestServiceAccount.id)).rejects.toThrow();
        }, 15 * 1000);
    });
};