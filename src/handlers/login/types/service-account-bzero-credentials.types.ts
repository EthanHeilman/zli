import { IdentityProvider } from '../../../../webshell-common-ts/auth-service/auth.types';

export interface ServiceAccountBzeroCredentials {
    mfa_secret: string;
    org_id: string;
    identity_provider: IdentityProvider;
}