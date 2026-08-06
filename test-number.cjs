// test-number.cjs
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const QRCodeTerminal = require('qrcode-terminal');

async function test() {
    console.log('🔍 Obteniendo número del bot...');
    
    const { state } = await useMultiFileAuthState('sessions');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection } = update;
        
        if (qr) {
            console.log('📱 Escanea el QR:');
            QRCodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ Conectado exitosamente!');
            console.log('📱 ID del bot (tu número):', sock.user.id);
            
            // Mostrar el número limpio
            const botNumber = sock.user.id.split(':')[0];
            console.log('📱 Número del bot (limpio):', botNumber);
            console.log('💡 ESTE es el número que debes guardar en tus contactos');
            
            // Enviar mensaje de prueba a TI
            try {
                await sock.sendMessage(sock.user.id, {
                    text: '🧪 ¡Hola! Este es un mensaje de prueba desde el bot a TI. ¿Lo ves en WhatsApp?'
                });
                console.log('✅ Mensaje de prueba enviado a tu WhatsApp');
                console.log('📱 Revisa tu WhatsApp, DEBES ver el mensaje');
            } catch (error) {
                console.error('❌ Error enviando mensaje:', error.message);
            }
            
            setTimeout(() => {
                console.log('👋 Cerrando...');
                process.exit(0);
            }, 5000);
        }
    });
}

test().catch(console.error);