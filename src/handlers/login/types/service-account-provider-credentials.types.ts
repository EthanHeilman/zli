export interface ServiceAccountProviderCredentials {
    client_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    jwksURL: string; // Only for generic service accounts
    jwksURLPattern: string; // Only for generic service accounts
    token_uri: string; // Only for GCP service accounts
}