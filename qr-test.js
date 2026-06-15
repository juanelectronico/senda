const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        browser: ['Senda Bot', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Escanea este código QR con WhatsApp:');
            qrcode.generate(qr, { small: true });
            fs.writeFileSync('whatsapp_qr.txt', qr);
            console.log('📁 QR también guardado en whatsapp_qr.txt');
        }
        
        if (connection === 'open') {
            console.log('✅ Conectado a WhatsApp exitosamente!');
            console.log('💬 Bot listo para recibir mensajes');
        }
        
        if (connection === 'close') {
            console.log('❌ Conexión cerrada');
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    // Diccionario para guardar estados de conversación
    const estados = new Map();
    
    // Palabras clave para iniciar el proceso de facturación
    const palabrasClave = [
        'factura', 'Factura', 'FACTURA',
        'quiero mi factura', 'Quiero mi factura', 'QUIERO MI FACTURA',
        'necesito factura', 'Necesito factura', 'NECESITO FACTURA',
        'me facturas', 'Me facturas', 'ME FACTURAS',
        'facturar', 'Facturar', 'FACTURAR'
    ];
    
    function esSolicitudFactura(texto) {
        if (!texto) return false;
        const textoLower = texto.toLowerCase();
        return palabrasClave.some(palabra => textoLower.includes(palabra.toLowerCase()));
    }
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        console.log(`📨 Mensaje de ${sender}: ${text}`);
        
        let respuesta = '';
        const estadoActual = estados.get(sender) || 'INICIO';
        
        if (estadoActual === 'INICIO') {
            if (esSolicitudFactura(text)) {
                respuesta = `Claro. Para generar tu factura, necesito:
                
📋 RFC:
🏢 Razón Social:
⚖️ Régimen Fiscal (ej. 601, 612):
📄 Uso CFDI (ej. G01, G03):
📮 Código Postal:
📧 Correo electrónico:

Envíame todos los datos en este orden en un solo mensaje`;
                estados.set(sender, 'ESPERANDO_DATOS');
            } else {
                respuesta = `Hola, soy Senda Bot 🤖
                
Estoy aquí para ayudarte con tus facturas.

Para solicitar una factura, puedes escribir:
• "Factura"
• "Quiero mi factura"
• "Necesito factura"

¿En qué puedo ayudarte?`;
                estados.set(sender, 'INICIO');
            }
        } 
        else if (estadoActual === 'ESPERANDO_DATOS') {
            respuesta = `✅ Datos recibidos correctamente.
            
Tu factura está siendo procesada.
El comercio la revisará en breve y te enviará la factura a tu correo.

Gracias por confiar en Senda.`;
            estados.set(sender, 'COMPLETADO');
            
            // También guardamos en consola para debugging
            console.log(`📋 Datos de facturación de ${sender}: ${text}`);
        }
        else if (estadoActual === 'COMPLETADO') {
            respuesta = `Ya hemos recibido tu solicitud de factura.
Si necesitas otra factura, escribe "Factura" nuevamente.
Gracias.`;
            estados.set(sender, 'INICIO');
        }
        
        await sock.sendMessage(sender, { text: respuesta });
    });
}

connectToWhatsApp().catch(console.error);