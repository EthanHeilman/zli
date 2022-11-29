export interface ServiceAccountAccessToken {
    aud: string,
    azp: string,
    email: string,
    email_verified: boolean,
    exp: number,
    org_id: string,
    iss: string,
    nonce: string,
    sub: string,
    iat: number,
    type: string,
}