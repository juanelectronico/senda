import { default: makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';

let sockATC: any = null;

export async function conectarATCSenda() {
    // Carpeta donde se guardará la sesión del número ATC principal de Senda
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '../../sessions/atc_session'));

    sockATC = makeWASocket({
        auth: state,
        printQRInTerminal: true // Aquí verás el QR inicial en tu consola de Railway/Local para conectar el número de ATC una sola vez
    });

    sockATC.ev.on('creds.update', saveCreds);

    sockATC.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Conexión ATC cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                conectarATCSenda();
            }
        } else if (connection === 'open') {
            console.log('✅ ¡Bot ATC de Senda conectado y listo para enviar mensajes!');
        }
    });

    return sockATC;
}

// Función reutilizable para enviar mensajes desde el número ATC de Senda
export async function enviarMensajeDesdeATC(telefonoDestino: string, textoMensaje: string) {
    if (!sockATC) {
        throw new Error('El socket ATC de Senda no está inicializado.');
    }

    // Limpiamos el número y le damos formato JID de WhatsApp
    const numeroLimpiado = telefonoDestino.replace(/\D/g, '');
    const jid = `${numeroLimpiado}@s.whatsapp.net`;

    await sockATC.sendMessage(jid, { text: textoMensaje });
    console.log(`📤 Mensaje enviado desde ATC de Senda a: ${numeroLimpiado}`);
}