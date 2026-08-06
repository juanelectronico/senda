// test-final.cjs
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const QRCodeTerminal = require('qrcode-terminal');

// 🔥 TU NÚMERO PERSONAL (sin el +)
const MI_NUMERO = '525643652322';

async function test() {
    console.log(`📱 Enviando mensaje a MI número: ${MI_NUMERO}`);
    console.log('📱 Escanea el QR para conectar el bot...');
    
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
            QRCodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado!');
            console.log(`📤 Enviando mensaje a: ${MI_NUMERO}`);
            
            try {
                const jid = `${MI_NUMERO}@s.whatsapp.net`;
                await sock.sendMessage(jid, {
                    text: `🧪 ¡Hola! Este es el BOT Senda enviándote un mensaje a TI (${MI_NUMERO}). ¿Lo ves en WhatsApp?`
                });
                console.log(`✅ Mensaje enviado a ${MI_NUMERO}`);
                console.log('📱 REVISA TU WHATSAPP - Debes ver el mensaje');
            } catch (error) {
                console.error('❌ Error:', error.message);
            }
            
            setTimeout(() => process.exit(0), 5000);
        }
    });
}

test();