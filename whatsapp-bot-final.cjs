// whatsapp-bot-final.cjs - CÓDIGO COMPLETO PARA COMERCIOS CON FACTURAPI
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCodeTerminal = require('qrcode-terminal');
const QRCodeImage = require('qrcode');
const express = require('express');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const FacturapiModule = require('facturapi');
const Facturapi = FacturapiModule.default || FacturapiModule;

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
console.log("FACTURAPI_SECRET_KEY existe:", process.env.FACTURAPI_SECRET_KEY ? "✅ Sí" : "❌ No");
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

// Inicializar Facturapi
const facturapi = new Facturapi(process.env.FACTURAPI_SECRET_KEY || '');

let sock = null;
let qrCode = null;
let isConnected = false;
let reconnectTimer = null;
let isReconnecting = false;
let messageQueue = [];

// Memoria temporal para rastrear estados de facturación por usuario
const userBillingState = new Map();

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

function getRealUserPhone(from, msg = null) {
    if (!from) return null;
    if (from.includes('@g.us') || from.includes('@broadcast')) {
        return null;
    }

    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');

    if (raw.length >= 10 && raw.length <= 13) {
        return cleanPhoneNumber(raw);
    }

    if (raw.length > 13) {
        return from; 
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

    // Ver si el usuario está en proceso de confirmar datos pendientes de factura
    const currentState = userBillingState.get(clientIdentifier);

    if (lower === 'confirmar' && currentState) {
        await sendMessageWithRetry(from, '⏳ Generando y timbrando tu factura ante el SAT, por favor espera un momento...');
        
        try {
            // 1. Crear o reusar cliente en Facturapi
            const customer = await facturapi.customers.create({
                legal_name: currentState.legal_name,
                tax_id: currentState.tax_id,
                tax_system: currentState.tax_system || '601', // General de Ley Personas Morales por defecto
                zip: currentState.zip,
                email: currentState.email,
            });

            // 2. Emitir CFDI 4.0
            const invoice = await facturapi.invoices.create({
                customer: customer.id,
                use: currentState.use || 'G03',
                payment_form: '01', // Efectivo o ajustable según requieras
                payment_method: 'PUE',
                items: [
                    {
                        quantity: 1,
                        product: {
                            description: currentState.concept || 'Consumo general',
                            product_key: '01010101', // Clave genérica SAT
                            price: parseFloat(currentState.amount) || 100.00,
                            unit_key: 'ACT'
                        }
                    }
                ]
            });

            // Limpiar estado temporal
            userBillingState.delete(clientIdentifier);

            await sendMessageWithRetry(from, 
                `🎉 *¡Factura Timbrada con Éxito!*\n\n` +
                `• *Folio UUID:* ${invoice.uuid}\n` +
                `• *Descarga PDF:* ${invoice.verification_url}\n\n` +
                `Gracias por tu compra en *${businessName}*.`
            );
        } catch (facturapiError) {
            console.error('❌ Error Facturapi al timbrar:', facturapiError);
            await sendMessageWithRetry(from, `❌ No se pudo generar la factura: ${facturapiError.message || 'Error desconocido en el timbrado'}. Verifica tus datos fiscales.`);
        }
        return;
    }

    if (lower.includes('factura') || lower.includes('facturar') || currentState) {
        // Si mandó datos para facturar, usamos Gemini para estructurarlos
        try {
            const extractionPrompt = `Analiza el siguiente texto enviado por un cliente que solicita una factura fiscal en México:
            "${text}"
            
            Extrae estrictamente en formato JSON los siguientes campos (si algún dato no viene explícitamente, pon null):
            {
              "tax_id": "RFC del cliente (12 o 13 caracteres, mayúsculas)",
              "legal_name": "Nombre o Razón Social",
              "email": "Correo electrónico",
              "amount": "Monto numérico de la compra (solo el número)",
              "zip": "Código postal fiscal (5 dígitos)",
              "tax_system": "Régimen fiscal (ej. 601, 612, 626, etc., o null si no se menciona)",
              "concept": "Concepto o número de ticket"
            }
            Responde ÚNICAMENTE con el objeto JSON válido, sin bloques de texto adicionales ni markdown de código.`;

            const aiResult = await model.generateContent(extractionPrompt);
            let jsonText = aiResult.response.text().trim();
            jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const parsedData = JSON.parse(jsonText);

            if (parsedData.tax_id && parsedData.legal_name) {
                // Guardar temporalmente el estado para confirmación
                userBillingState.set(clientIdentifier, parsedData);

                await sendMessageWithRetry(from, 
                    `📄 *Revisa tus datos fiscales para ${businessName}*\n\n` +
                    `• *RFC:* ${parsedData.tax_id}\n` +
                    `• *Razón Social:* ${parsedData.legal_name}\n` +
                    `• *Correo:* ${parsedData.email || 'No especificado'}\n` +
                    `• *Monto:* $${parsedData.amount || 'Por definir'}\n` +
                    `• *C.P.:* ${parsedData.zip || 'No especificado'}\n\n` +
                    `Si todo es correcto, responde con la palabra *CONFIRMAR* para proceder a timbrarla. Si deseas corregir algo, vuelve a enviar los datos completos.`
                );
                return;
            }
        } catch (e) {
            console.log('⚠️ No se pudo extraer JSON completo con IA, enviando guía estándar.');
        }

        await sendMessageWithRetry(from, 
            `📄 *Solicitud de Factura - ${businessName}*\n\n` +
            `Para generar tu factura, por favor envíanos en un solo mensaje:\n` +
            `• *RFC*\n` +
            `• *Nombre o Razón Social*\n` +
            `• *Código Postal*\n` +
            `• *Correo electrónico*\n` +
            `• *Monto y Concepto*`
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