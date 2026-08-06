import dotenv from 'dotenv';
import https from 'https';
dotenv.config();
/**
 * Emite una factura real (Timbrado CFDI) en Facturapi
 * @param invoiceData - Datos del cliente, items y método de pago
 */
export function emitirFacturaFacturapi(invoiceData) {
    return new Promise((resolve, reject) => {
        const dataString = JSON.stringify(invoiceData);
        const options = {
            hostname: 'www.facturapi.io',
            port: 443,
            path: '/v2/invoices',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + process.env.FACTURAPI_SECRET_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataString)
            }
        };
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseBody);
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        resolve(parsed); // Devuelve el objeto con el UUID, links del XML y PDF
                    }
                    else {
                        reject(new Error(`Error de Facturapi [${res.statusCode}]: ${responseBody}`));
                    }
                }
                catch (e) {
                    reject(new Error('Respuesta inválida de Facturapi: ' + responseBody));
                }
            });
        });
        req.on('error', (e) => {
            reject(new Error('ERROR DE CONEXIÓN AL TIMBRAR: ' + e.message));
        });
        // Enviar los datos al servidor
        req.write(dataString);
        req.end();
    });
}
