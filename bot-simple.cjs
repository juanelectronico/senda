// bot-simple.cjs - VERSIÓN MÍNIMA QUE FUNCIONA
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const QRCodeTerminal = require('qrcode-terminal');

async function startBot() {
    console.log('🤖 Iniciando bot SIMPLE...');
    
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection, lastDisconnect } = update;
        
        if (qr) {
            console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:\n');
            QRCodeTerminal.generate(qr, { small: true });
            console.log('\n💡 Abre WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo\n');
        }

        if (connection === 'open') {
            console.log('\n✅ ¡CONECTADO!');
            console.log('📱 Número del bot:', sock.user.id);
            console.log('🤖 El bot ya está escuchando mensajes.\n');
            
            // Enviar mensaje de prueba a TI
            const miNumero = '525643652322'; // TU número
            try {
                await sock.sendMessage(`${miNumero}@s.whatsapp.net`, {
                    text: '✅ ¡Hola! El bot Senda está funcionando. Este es un mensaje de prueba.'
                });
                console.log(`✅ Mensaje de prueba enviado a ${miNumero}`);
                console.log('📱 Revisa tu WhatsApp, DEBES ver el mensaje.\n');
            } catch (e) {
                console.log('⚠️ No se pudo enviar mensaje de prueba:', e.message);
            }
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Desconectado (código: ${code})`);
            if (code !== 401) {
                console.log('🔄 Reconectando en 5 segundos...');
                setTimeout(startBot, 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ===== RESPONDER MENSAJES =====
    sock.ev.on('messages.upsert', async (msgUpdate) => {
        const msg = msgUpdate.messages[0];
        if (!msg || msg.key.fromMe) return;
        
        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || '';
        
        if (!text) return;
        
        console.log(`📩 Mensaje de ${from}: ${text}`);
        
        // Responder automáticamente
        await sock.sendMessage(from, {
            text: `🤖 Recibí tu mensaje: "${text}".\n\nSoy Senda, tu asistente. Escribe *hola* para comenzar.`
        });
        console.log(`✅ Respondido a ${from}`);
    });
}

// ===== INICIAR =====
console.log('🔄 Iniciando...');
startBot().catch(console.error);