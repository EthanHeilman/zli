import { Logger } from '../logger.service/logger';
import { ConfigService, KubeConfig } from '../config.service/config.service';

const pem = require('pem')
const path = require('path');
const fs = require('fs');


export async function generateKubeconfigHandler(
    configService: ConfigService,
    logger: Logger
) {
    // Check if we already have generated a cert/key
    var kubeConfig = configService.getKubeConfig();
    
    if (kubeConfig == undefined) {
        logger.info('No KubeConfig has been generated before, generating key and cert for local daemon...')

        // Create and save key/cert
        const createCertPromise = new Promise<void>(async (resolve, reject) => {
            pem.createCertificate({ days: 999, selfSigned: true }, async function (err: any, keys: any) {
                if (err) {
                    throw err
                }

                // Get the path of where we want to save 
                var pathToConfig = path.dirname(configService.configPath());
                var pathToKey = `${pathToConfig}/kubeKey.pem`
                var pathToCert = `${pathToConfig}/kubeCert.pem`

                // Now save the key and cert
                await fs.writeFile(pathToKey, keys.serviceKey, function (err: any) {
                    if (err) {
                        logger.error('Error writing key to file!');
                        reject();
                        return;
                    }
                    logger.info('Generated and saved key file');
                });
            
                await fs.writeFile(pathToCert, keys.certificate, function (err: any) {
                    if (err) {
                        logger.error('Error writing cert to file!');
                        reject();
                        return;
                    }
                    logger.info('Generated and saved cert file');
                });

                // Generate a token that can be used for auth
                // TODO: generate random one, with ++++
                var token = 'q1bKLFOyUiosTfawzA93TzZIDzH2TNa2SMm0zEiPKTUwME6BkEo6Sql5yUWVBSWpKUGphaWpxSVAfekBOZbBhaEW+VlFUeVRGcluyVF5JT4+haZmPsluFoFu5XkpXk5BXq++++'

                // Now save the path in the configService
                kubeConfig = {
                    keyPath: pathToKey,
                    certPath: pathToCert,
                    token: token,
                    localHost: 'localhost',
                    localPort: 1234,
                    localPid: null
                }
                configService.setKubeConfig(kubeConfig)
                resolve()
            })
        });

        // TODO: try/catch block 
        await createCertPromise;
    }

    // Now generate a kubeConfig
    let clientKubeConfig = `
apiVersion: v1
clusters:
- cluster:
    server: https://localhost:1234
    # certificate-authority: ${kubeConfig['certPath']}
    insecure-skip-tls-verify: true
  name: bctl-server
contexts:
- context:
    cluster: bctl-server
    user: ${configService.me()['email']}
  name: bctl-server
current-context: bctl-server
preferences: {}
users:
  - name: ${configService.me()['email']}
    user:
      token: "${kubeConfig['token']}"
    `

    // Show it to the user
    logger.info(clientKubeConfig)
}