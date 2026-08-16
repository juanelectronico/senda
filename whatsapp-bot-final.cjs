// whatsapp-bot-final.cjs - VERSIÓN CORREGIDA Y UNIFICADA
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCodeTerminal = require('qrcode-terminal');
const QRCodeImage = require('qrcode');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

// ===== PARCHE DE EMERGENCIA PARA BAILEYS =====
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 30;

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

let sock = null;
let qrCode = null;
let isConnected = false;
let reconnectTimer = null;
let isReconnecting = false;
let messageQueue = [];

const userMessageCooldown = new Map();
const COOLDOWN_MS = 3000;
const MAX_MESSAGES_PER_MINUTE = 10;

const userBillingState = new Map();

// ===== SERVIDOR EXPRESS =====
const PORT = 3001;
const app = express();
const server = http.createServer(app);

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

// ============================================
// FACTURAPI V2 - CFDI 4.0
// ============================================
const FACTURAPI_API_URL = 'https://www.facturapi.io/v2';
const FACTURAPI_API_KEY = process.env.FACTURAPI_SECRET_KEY || '';

const facturapiClient = axios.create({
    baseURL: FACTURAPI_API_URL,
    headers: {
        'Authorization': `Bearer ${FACTURAPI_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

async function createFacturapiCustomer(data) {
    try {
        let taxSystem = data.tax_system;
        if (!taxSystem) {
            taxSystem = (data.tax_id && data.tax_id.length === 13) ? '605' : '601';
        }
        const response = await facturapiClient.post('/customers', {
            legal_name: data.legal_name,
            tax_id: data.tax_id,
            tax_system: taxSystem,
            email: data.email,
            address: { zip: data.zip }
        });
        return response.data;
    } catch (error) {
        console.error('❌ Error creando cliente Facturapi v2:', error.response?.data || error.message);
        throw error;
    }
}

async function createFacturapiInvoice(customerId, data, taxId) {
    try {
        let use = data.use;
        if (!use) {
            use = (taxId && taxId.length === 13) ? 'D01' : 'G03';
        }
        const response = await facturapiClient.post('/invoices', {
            customer: customerId,
            use: use,
            payment_form: '01',
            payment_method: 'PUE',
            items: [{
                quantity: 1,
                product: {
                    description: data.concept || 'Consumo general',
                    product_key: '01010101',
                    price: parseFloat(data.amount) || 100.00,
                    unit_key: 'ACT'
                }
            }]
        });
        return response.data;
    } catch (error) {
        console.error('❌ Error creando factura Facturapi v2:', error.response?.data || error.message);
        throw error;
    }
}

async function getFacturapiInvoice(invoiceId) {
    try {
        const response = await facturapiClient.get(`/invoices/${invoiceId}`);
        return response.data;
    } catch (error) {
        console.error('❌ Error obteniendo factura de Facturapi:', error.response?.data || error.message);
        throw error;
    }
}

function extractFiscalDataManual(text) {
    const data = { tax_id: null, legal_name: null, email: null, amount: null, zip: null, tax_system: null, concept: null, use: null };
    const rfcMatch = text.match(/[A-Za-zÑñ]{3,4}[0-9]{6,7}[A-Za-z0-9]{1,3}/);
    if (rfcMatch) data.tax_id = rfcMatch[0].toUpperCase();

    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) data.email = emailMatch[0];

    const zipMatch = text.match(/\b\d{5}\b/);
    if (zipMatch) data.zip = zipMatch[0];

    let cleanText = text;
    if (data.zip) cleanText = cleanText.replace(data.zip, '');
    cleanText = cleanText.replace(/monto/i, '').replace(/concepto/i, '').replace(/codigo postal/i, '').replace(/cp\s*:/gi, '');

    const amountMatch = cleanText.match(/\b(\d+\.?\d*)\b/);
    if (amountMatch) {
        const amount = parseFloat(amountMatch[1]);
        if (amount > 0 && amount < 1000000) data.amount = amount;
    }

    const conceptKeywords = ['concepto', 'pago', 'venta', 'compra', 'servicio', 'producto', 'impresión', 'concept'];
    for (const keyword of conceptKeywords) {
        if (text.toLowerCase().includes(keyword)) {
            const idx = text.toLowerCase().indexOf(keyword);
            data.concept = text.substring(idx, idx + 60).trim();
            break;
        }
    }
    return data;
}

// NUEVO ENDPOINT PARA SOLICITAR EL CÓDIGO DE EMPAREJAMIENTO DE 8 DÍGITOS
app.post('/api/whatsapp/request-pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Se requiere el número de teléfono' });
        }

        const cleanedPhone = cleanPhoneNumber(phone);
        if (!sock) {
            return res.status(500).json({ success: false, message: 'El bot de WhatsApp aún no está inicializado.' });
        }

        if (isConnected) {
            return res.json({ success: true, message: 'El WhatsApp ya se encuentra conectado.' });
        }

        console.log(`🔗 Solicitando código de emparejamiento de 8 dígitos para: ${cleanedPhone}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const code = await sock.requestPairingCode(cleanedPhone);
        console.log(`🔑 Código de emparejamiento generado: ${code}`);

        return res.json({ success: true, pairingCode: code });
    } catch (error) {
        console.error('❌ Error al solicitar código de emparejamiento:', error.message);
        return res.status(500).json({ success: false, error: error.message });
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
    if (raw.length === 11 && raw.startsWith('1')) return '52' + raw.substring(1);
    if (raw.length === 12 && raw.startsWith('52')) return raw;
    if (raw.length === 13 && raw.startsWith('521')) return '52' + raw.substring(3);
    if (raw.length > 13) {
        const match = raw.match(/\d{10}/);
        if (match) return '52' + match[0];
    }
    return raw;
}

function getRealUserPhone(from) {
    if (!from || from.includes('@g.us') || from.includes('@broadcast')) return null;
    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');
    if (raw.length === 15 || raw.length === 16) {
        const match = from.match(/(\d{10})/);
        return match ? cleanPhoneNumber(match[1]) : null;
    }
    return (raw.length >= 10 && raw.length <= 13) ? cleanPhoneNumber(raw) : raw;
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
            return true;
        } catch (error) {
            attempt++;
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
    console.log('🤖 Iniciando bot de WhatsApp para el Comercio (Modo Emparejamiento por Código)...');

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
            retryRequestDelayMs: 500,
            getMessage: async () => ({ conversation: 'Hola' })
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                isConnected = true;
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
                    console.log('❌ Sesión cerrada. Borra la carpeta "sessions" para re-vincular.');
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0) return;

                for (const msg of msgs) {
                    if (!msg?.message || msg.key.fromMe) continue;
                    const from = msg.key.remoteJid;
                    if (!from || from.includes('@broadcast') || from.includes('@g.us')) continue;

                    const text = msg.message.conversation || 
                                 msg.message.extendedTextMessage?.text || 
                                 msg.message.ephemeralMessage?.message?.conversation ||
                                 msg.message.ephemeralMessage?.message?.extendedTextMessage?.text || 
                                 msg.message.imageMessage?.caption || '';

                    if (!text) continue;

                    let clientIdentifier = getRealUserPhone(from);
                    if (!clientIdentifier) clientIdentifier = from.replace(/@.*$/, '');

                    const userKey = clientIdentifier;
                    const now = Date.now();
                    if (userMessageCooldown.has(userKey) && now - userMessageCooldown.get(userKey) < COOLDOWN_MS) {
                        continue;
                    }
                    userMessageCooldown.set(userKey, now);

                    try {
                        await handleClientMessage(from, text, clientIdentifier, msg);
                    } catch (err) {
                        console.error(`❌ Error procesando mensaje de cliente:`, err.message);
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
        const { data } = await supabase
            .from('commerce')
            .select('*')
            .eq('phone', cleanBotPhone)
            .maybeSingle();
        if (data) commerce = data;
    } catch (err) {}

    const businessName = commerce?.business_name || "nuestro establecimiento";
    const lower = text.toLowerCase().trim();
    const currentState = userBillingState.get(clientIdentifier);

    if (lower === 'confirmar' && currentState) {
        await sendMessageWithRetry(from, '⏳ Generando y timbrando tu factura ante el SAT, por favor espera un momento...');
        try {
            const customer = await createFacturapiCustomer({
                legal_name: currentState.legal_name,
                tax_id: currentState.tax_id,
                tax_system: currentState.tax_system || null,
                zip: currentState.zip,
                email: currentState.email
            });

            const invoice = await createFacturapiInvoice(customer.id, {
                use: currentState.use || null,
                concept: currentState.concept || 'Consumo general',
                amount: currentState.amount || 100.00
            }, currentState.tax_id);

            const fullInvoice = await getFacturapiInvoice(invoice.id);
            userBillingState.delete(clientIdentifier);
            await downloadAndSendInvoice(from, fullInvoice);
            return;
        } catch (facturapiError) {
            await sendMessageWithRetry(from, `❌ No se pudo generar la factura: ${facturapiError.message}`);
            return;
        }
    }

    if (lower === 'rechazar' && currentState) {
        userBillingState.delete(clientIdentifier);
        await sendMessageWithRetry(from, '✅ Solicitud de factura cancelada.');
        return;
    }

    const hasRFC = text.match(/[A-Za-zÑñ]{3,4}[0-9]{6,7}[A-Za-z0-9]{1,3}/);
    const hasEmail = text.includes('@');
    const hasZip = text.match(/\b\d{5}\b/);
    
    const isFacturaRequest = lower.includes('factura') || lower.includes('facturar') || lower.includes('cfdi') || currentState;

    if (isFacturaRequest) {
        let parsedData = extractFiscalDataManual(text);
        if (parsedData.tax_id && parsedData.tax_id.length >= 12) {
            userBillingState.set(clientIdentifier, parsedData);
            await sendMessageWithRetry(from, 
                `📄 *Revisa tus datos fiscales para ${businessName}*\n\n` +
                `• *RFC:* ${parsedData.tax_id}\n` +
                `• *Razón Social:* ${parsedData.legal_name || 'No especificado'}\n` +
                `• *Correo:* ${parsedData.email || 'No especificado'}\n` +
                `• *Monto:* $${parsedData.amount || 'Por definir'}\n` +
                `• *C.P.:* ${parsedData.zip || 'No especificado'}\n\n` +
                `✅ *¿Todo es correcto?* Responde con la palabra *CONFIRMAR* para timbrar.`
            );
            return;
        }
        await sendMessageWithRetry(from, `📄 Por favor envíanos los datos: RFC, Nombre, CP, Correo, Monto y Concepto.`);
        return;
    }

    try {
        const prompt = `Asistente de ${businessName}. Cliente dijo: "${text}". Responde amable.`;
        const result = await model.generateContent(prompt);
        await sendMessageWithRetry(from, result.response.text());
    } catch (geminiError) {
        await sendMessageWithRetry(from, `👋 ¡Hola! ¿En qué podemos ayudarte? Si necesitas factura, escribe *solicitar factura*.`);
    }
}

async function downloadAndSendInvoice(from, fullInvoice) {
    try {
        const pdfUrl = `https://www.facturapi.io/v2/invoices/${fullInvoice.id}/pdf`;
        const response = await axios.get(pdfUrl, {
            headers: { 'Authorization': `Bearer ${FACTURAPI_API_KEY}` },
            responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(response.data, 'binary');
        await sock.sendMessage(from, { 
            document: buffer,
            fileName: `Factura_${fullInvoice.id}.pdf`,
            mimetype: 'application/pdf',
            caption: `🎉 *¡Factura Timbrada con Éxito!*\n\n*UUID:* ${fullInvoice.id}\n*Total:* $${fullInvoice.total}`
        });
        return true;
    } catch (error) {
        await sendMessageWithRetry(from, `🎉 *¡Factura Timbrada con Éxito!*\n\n*UUID:* ${fullInvoice.id}`);
        return false;
    }
}

// ===== MANEJO DE SEÑALES PARA CIERRE GRACIAL =====
process.on('SIGINT', async () => {
    console.log('\n🛑 Recibida señal de interrupción. Cerrando bot...');
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (sock) {
        try {
            await sock.ws.close();
        } catch (err) {}
    }
    console.log('👋 Bot cerrado correctamente');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Recibida señal de terminación. Cerrando bot...');
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (sock) {
        try {
            await sock.ws.close();
        } catch (err) {}
    }
    console.log('👋 Bot cerrado correctamente');
    process.exit(0);
});

// ===== INICIAR BOT =====
console.log('🔄 Iniciando bot...');
startBot().catch(console.error);

// Monitoreo de salud
setInterval(() => {
    if (!isConnected && sock) {
        console.warn('⚠️ Bot conectado pero no está en estado "open"');
    }
}, 60000);