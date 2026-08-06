import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import path from 'path';
export async function generarPairingCodeParaComercio(telefonoComercio) {
    const telefonoLimpio = telefonoComercio.replace(/\D/g, '');
    // Carpeta temporal aislada para la sesión de este comercio específico
    const sessionDir = path.join(__dirname, `../../sessions/commerce_${telefonoLimpio}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const sockCommerce = makeWASocket({
        auth: state,
        printQRInTerminal: false // Importante: en falso para que no intente mostrar QR en consola, usaremos el código de 8 dígitos
    });
    sockCommerce.ev.on('creds.update', saveCreds);
    return new Promise((resolve, reject) => {
        // Damos unos segundos para que el socket establezca la conexión inicial con los servidores de WhatsApp
        setTimeout(async () => {
            try {
                if (!sockCommerce.authState.creds.registered) {
                    // Solicitamos el código de 8 dígitos usando el número limpio del comercio
                    const code = await sockCommerce.requestPairingCode(telefonoLimpio);
                    console.log(`🔑 Código de 8 dígitos generado con éxito para el comercio: ${telefonoLimpio}`);
                    resolve(code);
                }
                else {
                    reject(new Error('El comercio ya cuenta con una sesión registrada previamente.'));
                }
            }
            catch (error) {
                console.error('❌ Error al solicitar el pairing code:', error);
                reject(error);
            }
        }, 4000); // 4 segundos de margen de conexión
    });
}
