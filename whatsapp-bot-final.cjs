// whatsapp-bot-final.cjs - CÓDIGO COMPLETO PARA COMERCIOS
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCodeTerminal = require('qrcode-terminal');
const QRCodeImage = require('qrcode');
const express = require('express');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 30;

const PORT = 3001;
const app = express();
const server = http.createServer(app);

require('dotenv').config();

console.log("=== DIAGNÓSTICO SENDA (BOT DE COMERCIO) ===");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL || "❌ No encontrada");
console.log("SUPABASE_KEY existe:", process.env.SUPABASE_KEY ? "✅ Sí" : "❌ No");
console.log("GEMINI_API_KEY existe:", process.env.GEMINI_API_KEY ? "✅ Sí" : "❌ No");
console.log("==========================================");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('❌ ERROR CRÍTICO: Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

let sock = null;
let qrCode = null;
let isConnected = false;
let reconnectTimer = null;
let isReconnecting = false;
let messageQueue = [];

const userMessageCooldown = new Map();
const COOLDOWN_MS = 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/qr', async (req, res) => {
    if (qrCode) {
        try {
            const qrImageBuffer = await QRCodeImage.toBuffer(qrCode);
            res.setHeader('Content-Type', 'image/png');
            res.send(qrImageBuffer);
            console.log('🖼️ QR enviado como imagen');
        } catch (error) {
            console.error('❌ Error generando QR:', error);
            res.status(500).json({ error: 'Error generando QR' });
        }
    } else {
        res.json({ qr: null, message: 'No QR available' });
    }
});

app.get('/status', (req, res) => {
    res.json({ 
        connected: isConnected, 
        ready: sock !== null,
        botPhone: sock?.user?.id ? cleanPhoneNumber(sock.user.id.split(':')[0]) : null,
        queueSize: messageQueue.length
    });
});

server.listen(PORT, () => {
    console.log(`🚀 API del Bot en http://localhost:${PORT}`);
});

async function reconnectBot() {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('🔄 Intentando reconexión en 5 segundos...');
    
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    
    reconnectTimer = setTimeout(async () => {
        try {
            await startBot();
        } catch (error) {
            console.error('❌ Error en reconexión:', error);
        } finally {
            isReconnecting = false;
            reconnectTimer = null;
        }
    }, 5000);
}

function cleanPhoneNumber(phone) {
    if (!phone) return null;
    let raw = String(phone).replace(/\D/g, '');
    if (raw.length === 10) return '52' + raw;
    if (raw.length === 12) return raw;
    if (raw.length === 13 && raw.startsWith('521')) return '52' + raw.substring(3);
    return raw;
}

// Función actualizada para manejar tanto números normales como IDs internos (LID)
function getRealUserPhone(from, msg = null) {
    if (!from) return null;
    if (from.includes('@g.us') || from.includes('@broadcast')) {
        return null;
    }

    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');

    // Si es un número tradicional de teléfono válido
    if (raw.length >= 10 && raw.length <= 13) {
        return cleanPhoneNumber(raw);
    }

    // Si es un identificador LID interno de WhatsApp (números largos de 14+ dígitos)
    if (raw.length > 13) {
        return from; // Devolvemos el identificador completo para garantizar la comunicación con el chat
    }

    return raw;
}

async function sendMessageWithRetry(to, text, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            if (!sock) {
                messageQueue.push({ to, text, retries: 3 });
                return false;
            }
            
            // Si 'to' es un identificador LID o JID completo, lo usamos tal cual; si es número de 10 dígitos, le añadimos @s.whatsapp.net
            let jid = to;
            if (!to.includes('@')) {
                let cleanTo = cleanPhoneNumber(to);
                if (!cleanTo) return false;
                jid = `${cleanTo}@s.whatsapp.net`;
            }
            
            await sock.sendMessage(jid, { text: text });
            console.log(`✅ Mensaje enviado exitosamente a ${to}`);
            return true;
        } catch (error) {
            attempt++;
            console.error(`⚠️ Intento ${attempt} fallido al enviar mensaje a ${to}:`, error.message);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, attempt * 1500));
            }
        }
    }
    messageQueue.push({ to, text, retries: 3 });
    return false;
}

setInterval(async () => {
    if (messageQueue.length === 0 || !sock) return;
    const batch = messageQueue.splice(0, 5);
    for (const msg of batch) {
        await sendMessageWithRetry(msg.to, msg.text, 2);
    }
}, 10000);

async function startBot() {
    console.log('🤖 Iniciando bot de WhatsApp para el Comercio...');

    try {
        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLink: false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            connectTimeoutMs: 60000,
            qrTimeout: 60000,
            retryRequestDelayMs: 500,
            getMessage: async () => ({ conversation: 'Hola' })
        });

        if (sock.ws) {
            sock.ws.on('error', (err) => {
                if (err?.message?.includes('Timed Out')) {
                    console.log('⚠️ [Aviso] Timeout menor en socket ignorado.');
                }
            });
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCode = qr;
                console.log('📱 Escanea el código QR con el WhatsApp del COMERCIO:');
                QRCodeTerminal.generate(qr, { small: true }); 
                console.log('💡 Ver QR como imagen en: http://localhost:3001/qr');
            }

            if (connection === 'open') {
                isConnected = true;
                qrCode = null;
                isReconnecting = false;
                const botNumber = sock.user?.id ? cleanPhoneNumber(sock.user.id.split(':')[0]) : 'Desconocido';
                console.log(`✅ WhatsApp del Comercio conectado exitosamente! (Número: ${botNumber})`);
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    await reconnectBot();
                } else {
                    console.log('❌ Sesión cerrada. Borra la carpeta "sessions" y escanea el QR del comercio nuevamente.');
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0) return;

                for (const msg of msgs) {
                    if (!msg?.message) continue;
                    if (msg.key.fromMe) continue;
                    
                    const from = msg.key.remoteJid;
                    if (!from || from.includes('@broadcast') || from.includes('@g.us')) continue;

                    const text = msg.message.conversation || 
                                 msg.message.extendedTextMessage?.text || 
                                 msg.message.ephemeralMessage?.message?.conversation ||
                                 msg.message.ephemeralMessage?.message?.extendedTextMessage?.text || 
                                 msg.message.imageMessage?.caption || '';

                    if (!text) continue;

                    const clientIdentifier = getRealUserPhone(from, msg);
                    if (!clientIdentifier) continue;

                    const userKey = clientIdentifier;
                    const now = Date.now();
                    if (userMessageCooldown.has(userKey) && now - userMessageCooldown.get(userKey) < COOLDOWN_MS) {
                        continue;
                    }
                    userMessageCooldown.set(userKey, now);

                    console.log(`📩 Mensaje recibido de ${clientIdentifier}: ${text}`);

                    try {
                        await handleClientMessage(from, text, clientIdentifier, msg);
                    } catch (err) {
                        console.error(`❌ Error procesando mensaje de cliente:`, err.message);
                        await sendMessageWithRetry(from, '⚠️ Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.');
                    }
                }
            } catch (error) {
                console.error('❌ Error en messages.upsert:', error);
            }
        });

    } catch (error) {
        console.error('❌ Error iniciando bot:', error);
        await reconnectBot();
    }
}

async function handleClientMessage(from, text, clientIdentifier, msg) {
    const botJid = sock.user?.id ? sock.user.id.split(':')[0] : null;
    let cleanBotPhone = cleanPhoneNumber(botJid);

    let commerce = null;
    try {
        const { data, error } = await supabase
            .from('commerce')
            .select('*')
            .eq('phone', cleanBotPhone)
            .maybeSingle();
        
        if (!error && data) {
            commerce = data;
        }
    } catch (err) {
        console.error('⚠️ Error consultando comercio en Supabase:', err.message);
    }

    const businessName = commerce?.business_name || "nuestro establecimiento";
    const lower = text.toLowerCase().trim();

    if (lower.includes('factura') || lower.includes('facturar')) {
        await sendMessageWithRetry(from, 
            `📄 *Solicitud de Factura - ${businessName}*\n\n` +
            `Para generar tu factura, por favor envíanos los siguientes datos en un solo mensaje:\n` +
            `• *RFC*\n` +
            `• *Nombre o Razón Social*\n` +
            `• *Correo electrónico*\n` +
            `• *Monto de compra*\n` +
            `• *Número de ticket o concepto*\n\n` +
            `En breve un asesor o el sistema validará tu información.`
        );
        return;
    }

    try {
        const prompt = `Eres el asistente virtual de atención al cliente de un negocio llamado "${businessName}". 
        Un cliente te acaba de escribir por WhatsApp: "${text}".
        Responde de manera amable, profesional y corta en español ayudándole con sus dudas generales, información del negocio o guiándolo si requiere una factura. 
        No menciones que eres una IA de Google, compórtate como el asistente oficial del comercio.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();
        await sendMessageWithRetry(from, response);
    } catch (geminiError) {
        await sendMessageWithRetry(from, 
            `👋 ¡Hola! Gracias por comunicarte con *${businessName}*.\n\n` +
            `¿En qué podemos ayudarte hoy? Si necesitas factura, escribe la palabra *factura*.`
        );
    }
}

process.on('SIGINT', async () => {
    if (sock) { try { await sock.ws.close(); } catch (err) {} }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (sock) { try { await sock.ws.close(); } catch (err) {} }
    process.exit(0);
});

startBot().catch(console.error);