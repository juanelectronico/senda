// whatsapp-bot-final.cjs - VERSIÓN FINAL CON CORRECCIÓN DE `invoice.id` (Facturapi V2)
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCodeTerminal = require('qrcode-terminal');
const QRCodeImage = require('qrcode');
const express = require('express');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

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

// ============================================
// FACTURAPI V2 - CFDI 4.0
// ============================================
const FACTURAPI_API_URL = 'https://www.facturapi.io/v2';
const FACTURAPI_API_KEY = process.env.FACTURAPI_SECRET_KEY || '';

console.log(`📍 Facturapi URL: ${FACTURAPI_API_URL}`);

// Cliente HTTP para Facturapi
const facturapiClient = axios.create({
    baseURL: FACTURAPI_API_URL,
    headers: {
        'Authorization': `Bearer ${FACTURAPI_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

// ============================================
// CORREGIDO: Detección automática de régimen fiscal y UsoCFDI
// ============================================
async function createFacturapiCustomer(data) {
    try {
        let taxSystem = data.tax_system;
        if (!taxSystem) {
            if (data.tax_id && data.tax_id.length === 13) {
                taxSystem = '605';
                console.log(`📌 Régimen detectado automáticamente: 605 (Persona Física)`);
            } else {
                taxSystem = '601';
                console.log(`📌 Régimen detectado automáticamente: 601 (Persona Moral)`);
            }
        }
        
        const response = await facturapiClient.post('/customers', {
            legal_name: data.legal_name,
            tax_id: data.tax_id,
            tax_system: taxSystem,
            email: data.email,
            address: {
                zip: data.zip
            }
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
            if (taxId && taxId.length === 13) {
                use = 'D01';
                console.log(`📌 UsoCFDI detectado automáticamente: D01 (Persona Física)`);
            } else {
                use = 'G03';
                console.log(`📌 UsoCFDI detectado automáticamente: G03 (Persona Moral)`);
            }
        }
        
        const response = await facturapiClient.post('/invoices', {
            customer: customerId,
            use: use,
            payment_form: '01',
            payment_method: 'PUE',
            items: [
                {
                    quantity: 1,
                    product: {
                        description: data.concept || 'Consumo general',
                        product_key: '01010101',
                        price: parseFloat(data.amount) || 100.00,
                        unit_key: 'ACT'
                    }
                }
            ]
        });
        return response.data;
    } catch (error) {
        console.error('❌ Error creando factura Facturapi v2:', error.response?.data || error.message);
        throw error;
    }
}

// ============================================
// NUEVA FUNCIÓN: OBTENER FACTURA COMPLETA CON LINKS
// ============================================
async function getFacturapiInvoice(invoiceId) {
    try {
        const response = await facturapiClient.get(`/invoices/${invoiceId}`);
        return response.data;
    } catch (error) {
        console.error('❌ Error obteniendo factura de Facturapi:', error.response?.data || error.message);
        throw error;
    }
}

// ============================================
// EXTRACTOR MANUAL DE DATOS FISCALES (SIN GEMINI)
// ============================================
function extractFiscalDataManual(text) {
    const data = {
        tax_id: null,
        legal_name: null,
        email: null,
        amount: null,
        zip: null,
        tax_system: null,
        concept: null,
        use: null
    };

    const rfcMatch = text.match(/[A-Za-zÑñ]{3,4}[0-9]{6,7}[A-Za-z0-9]{1,3}/);
    if (rfcMatch) {
        data.tax_id = rfcMatch[0].toUpperCase();
        console.log(`📌 RFC extraído manualmente: ${data.tax_id}`);
    }

    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
        data.email = emailMatch[0];
        console.log(`📌 Email extraído manualmente: ${data.email}`);
    }

    const zipMatch = text.match(/\b\d{5}\b/);
    if (zipMatch) {
        data.zip = zipMatch[0];
        console.log(`📌 CP extraído manualmente: ${data.zip}`);
    }

    let cleanText = text;
    if (data.zip) {
        cleanText = cleanText.replace(data.zip, '');
    }
    cleanText = cleanText.replace(/monto/i, '').replace(/concepto/i, '').replace(/codigo postal/i, '').replace(/cp\s*:/gi, '');

    const amountMatch = cleanText.match(/\b(\d+\.?\d*)\b/);
    if (amountMatch) {
        const amount = parseFloat(amountMatch[1]);
        if (amount > 0 && amount < 1000000) {
            data.amount = amount;
            console.log(`📌 Monto extraído manualmente: ${data.amount}`);
        }
    }

    const conceptKeywords = ['concepto', 'pago', 'venta', 'compra', 'servicio', 'producto', 'impresión', 'concept'];
    for (const keyword of conceptKeywords) {
        if (text.toLowerCase().includes(keyword)) {
            const idx = text.toLowerCase().indexOf(keyword);
            const phrase = text.substring(idx, idx + 60).trim();
            data.concept = phrase;
            console.log(`📌 Concepto extraído manualmente: ${data.concept}`);
            break;
        }
    }

    if (data.tax_id) {
        let afterRfc = text.replace(data.tax_id, '').trim();
        afterRfc = afterRfc.replace(/cp\s*:/gi, '').replace(/codigo postal\s*:/gi, '').trim();
        
        if (data.email) {
            let beforeEmail = afterRfc.split(data.email)[0].trim();
            if (data.zip) {
                beforeEmail = beforeEmail.replace(data.zip, '').trim();
            }
            if (beforeEmail.length > 3 && beforeEmail.length < 80) {
                data.legal_name = beforeEmail;
                console.log(`📌 Nombre extraído manualmente: ${data.legal_name}`);
            }
        } else if (data.zip) {
            let beforeZip = afterRfc.split(data.zip)[0].trim();
            if (beforeZip.length > 3 && beforeZip.length < 80) {
                data.legal_name = beforeZip;
                console.log(`📌 Nombre extraído manualmente: ${data.legal_name}`);
            }
        }
    }

    console.log('📊 Resultado extracción manual:', data);
    return data;
}

let sock = null;
let qrCode = null;
let isConnected = false;
let reconnectTimer = null;
let isReconnecting = false;
let messageQueue = [];

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
    if (raw.length === 11 && raw.startsWith('1')) {
        return '52' + raw.substring(1);
    }
    if (raw.length === 12 && raw.startsWith('52')) return raw;
    if (raw.length === 13 && raw.startsWith('521')) {
        return '52' + raw.substring(3);
    }
    if (raw.length > 13) {
        const match = raw.match(/\d{10}/);
        if (match) return '52' + match[0];
    }
    console.log(`⚠️ No se pudo limpiar número: ${phone} -> ${raw}`);
    return raw;
}

function getRealUserPhone(from, msg = null) {
    if (!from) return null;
    if (from.includes('@g.us') || from.includes('@broadcast')) {
        return null;
    }
    
    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');
    
    if (raw.length === 15 || raw.length === 16) {
        const match = from.match(/(\d{10})/);
        if (match) {
            console.log(`🔍 Extrayendo número de @lid: ${match[1]}`);
            return cleanPhoneNumber(match[1]);
        }
        console.log(`⚠️ No se pudo extraer número de: ${from}`);
        return null;
    }
    
    if (raw.length >= 10 && raw.length <= 13) {
        return cleanPhoneNumber(raw);
    }
    
    if (raw.length > 13) {
        const match = from.match(/(\d{10})/);
        if (match) {
            return cleanPhoneNumber(match[1]);
        }
        return null;
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

                    let clientIdentifier = getRealUserPhone(from, msg);
                    if (!clientIdentifier) {
                        clientIdentifier = from.replace(/@.*$/, '');
                        console.log(`⚠️ Usando fallback JID: ${clientIdentifier} para mensaje: ${text.substring(0, 30)}...`);
                    }

                    const userKey = clientIdentifier;
                    const now = Date.now();
                    if (userMessageCooldown.has(userKey) && now - userMessageCooldown.get(userKey) < COOLDOWN_MS) {
                        continue;
                    }
                    userMessageCooldown.set(userKey, now);

                    console.log(`📩 Mensaje recibido de ${clientIdentifier}: ${text.substring(0, 50)}...`);

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

    console.log(`🔍 Procesando mensaje de: ${clientIdentifier}`);
    console.log(`🔍 Texto: "${text}"`);

    let commerce = null;
    try {
        const { data, error } = await supabase
            .from('commerce')
            .select('*')
            .eq('phone', cleanBotPhone)
            .maybeSingle();
        
        if (!error && data) {
            commerce = data;
            console.log(`✅ Comercio encontrado: ${commerce.business_name}`);
        } else {
            console.log(`⚠️ Comercio no encontrado para: ${cleanBotPhone}`);
        }
    } catch (err) {
        console.error('⚠️ Error consultando comercio en Supabase:', err.message);
    }

    const businessName = commerce?.business_name || "nuestro establecimiento";
    const lower = text.toLowerCase().trim();

    const currentState = userBillingState.get(clientIdentifier);
    console.log(`📊 Estado actual del usuario: ${currentState ? '✅ Tiene datos pendientes' : '❌ Sin datos'}`);

    if (lower === 'confirmar' && currentState) {
        console.log('🔔 USUARIO CONFIRMÓ FACTURA');
        
        const requiredFields = ['legal_name', 'tax_id', 'email', 'zip', 'amount'];
        const missingFields = requiredFields.filter(field => !currentState[field]);
        
        if (missingFields.length > 0) {
            console.log(`❌ Faltan campos: ${missingFields.join(', ')}`);
            await sendMessageWithRetry(from, 
                `❌ *Faltan datos para timbrar la factura:*\n` +
                `${missingFields.map(f => `• ${f}`).join('\n')}\n\n` +
                `Por favor, envía todos los datos nuevamente en un solo mensaje:\n` +
                `RFC, Nombre, CP, Correo, Monto y Concepto.`
            );
            userBillingState.delete(clientIdentifier);
            return;
        }

        await sendMessageWithRetry(from, '⏳ Generando y timbrando tu factura ante el SAT, por favor espera un momento...');
        
        try {
            console.log('📊 Datos a timbrar:', JSON.stringify(currentState, null, 2));
            
            const customer = await createFacturapiCustomer({
                legal_name: currentState.legal_name,
                tax_id: currentState.tax_id,
                tax_system: currentState.tax_system || null,
                zip: currentState.zip,
                email: currentState.email
            });
            console.log(`✅ Cliente Facturapi v2 creado: ${customer.id}`);

            const invoice = await createFacturapiInvoice(customer.id, {
                use: currentState.use || null,
                concept: currentState.concept || 'Consumo general',
                amount: currentState.amount || 100.00
            }, currentState.tax_id);
            console.log(`✅ Factura timbrada v2: ${invoice.id}`);

            // ============================================
            // CORRECCIÓN FINAL: Obtener la factura completa usando el ID
            // ============================================
            const fullInvoice = await getFacturapiInvoice(invoice.id);
            
            console.log('📄 RESPUESTA COMPLETA DE FACTURAPI:', JSON.stringify(fullInvoice, null, 2));
            
            if (!fullInvoice.id) {
                console.error("❌ ERROR CRÍTICO: Facturapi no devolvió un ID válido");
            }
            // ============================================
            // DESCARGAR Y ENVIAR PDF Y XML CON AXIOS
            // ============================================
            try {
                console.log('⬇️ Descargando PDF y XML desde Facturapi...');
                
                const secretKey = process.env.FACTURAPI_SECRET_KEY;
                const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
                const fileNameBase = `Factura_${fullInvoice.folio_number || fullInvoice.id}`;
                
                // Usamos la variable de destino correcta de tu scope (ej. remoteJid o msg.key.remoteJid)
                const targetJid = msg.key.remoteJid; 

                // 1. Enviar PDF
                const pdfResponse = await axios.get(`https://www.facturapi.io/v2/invoices/${fullInvoice.id}/pdf`, {
                    responseType: 'arraybuffer',
                    headers: { 'Authorization': authHeader }
                });

                await sock.sendMessage(targetJid, {
                    document: Buffer.from(pdfResponse.data),
                    mimetype: 'application/pdf',
                    fileName: `${fileNameBase}.pdf`,
                    caption: '📄 Aquí tienes tu factura en formato PDF.'
                });
                console.log('✅ PDF enviado exitosamente');

                // 2. Enviar XML
                const xmlResponse = await axios.get(`https://www.facturapi.io/v2/invoices/${fullInvoice.id}/xml`, {
                    responseType: 'text',
                    headers: { 
                        'Authorization': authHeader,
                        'Accept': 'application/xml, text/xml'
                    }
                });

                await sock.sendMessage(targetJid, {
                    document: Buffer.from(xmlResponse.data, 'utf-8'),
                    mimetype: 'application/xml',
                    fileName: `${fileNameBase}.xml`,
                    caption: '📦 Aquí tienes tu factura en formato XML.'
                });
                console.log('✅ XML enviado exitosamente');

            } catch (sendErr) {
                console.error('⚠️ Error descargando/enviando documentos por WhatsApp:', sendErr.response?.data || sendErr.message);
            }
            // ============================================
            // GUARDAR EN SUPABASE
            // ============================================
            const { error: saveError } = await supabase
                .from('invoice')
                .insert({
                    id: fullInvoice.id,
                    commerceId: commerce?.id || null,
                    razon_social: currentState.legal_name,
                    customerRfc: currentState.tax_id,
                    customerEmail: currentState.email,
                    client_email: currentState.email,
                    amount: parseFloat(currentState.amount) || 0,
                    concepto: currentState.concept || 'Consumo general',
                    facturapiId: fullInvoice.id,
                    status: 'STAMPED',
                    createdAt: new Date().toISOString()
                });

            if (saveError) {
                console.error('⚠️ Error guardando en Supabase:', saveError);
            } else {
                console.log(`✅ Factura guardada en Supabase: ${fullInvoice.id}`);
            }

            userBillingState.delete(clientIdentifier);
    
            // ============================================
            // ENVIAR EL PDF COMO ARCHIVO ADJUNTO (YA NO ENVÍA LINKS ROTOS)
            // ============================================
            await downloadAndSendInvoice(from, fullInvoice, businessName);
            
            return; // Importante: salir aquí para no seguir al catch

        } catch (facturapiError) {
            console.error('❌ Error Facturapi v2:', facturapiError.message);
            const errorDetail = facturapiError.response?.data?.message || facturapiError.message;
            await sendMessageWithRetry(from, 
                `❌ No se pudo generar la factura: ${errorDetail}\n\n` +
                `Verifica tus datos fiscales e intenta nuevamente.`
            );
            return;
        }
    }

    if (lower === 'rechazar' && currentState) {
        userBillingState.delete(clientIdentifier);
        await sendMessageWithRetry(from, '✅ Solicitud de factura cancelada. Si necesitas ayuda, escríbenos.');
        return;
    }

    // ... (El resto del código se mantiene igual)
    const hasRFC = text.match(/[A-Za-zÑñ]{3,4}[0-9]{6,7}[A-Za-z0-9]{1,3}/);
    const hasEmail = text.includes('@');
    const hasZip = text.match(/\b\d{5}\b/);
    
    const isFacturaRequest = lower.includes('factura') || 
                             lower.includes('facturar') || 
                             lower.includes('solicitar') ||
                             lower.includes('cfdi') ||
                             lower.includes('timbrar') ||
                             lower.includes('facturacion') ||
                             (hasRFC && hasEmail) ||
                             (hasRFC && hasZip) ||
                             (hasRFC && hasEmail && hasZip) ||
                             currentState;

    if (isFacturaRequest) {
        if (currentState && !lower.includes('confirmar') && !lower.includes('rechazar')) {
            userBillingState.delete(clientIdentifier);
        }

        let parsedData = null;
        let extractionSuccess = false;

        try {
            parsedData = extractFiscalDataManual(text);
            if (parsedData.tax_id && parsedData.tax_id.length >= 12) {
                extractionSuccess = true;
            }
        } catch (manualError) {}

        if (!extractionSuccess) {
            try {
                const extractionPrompt = `Analiza el siguiente texto y extrae los datos fiscales en formato JSON: "${text}"`;
                const aiResult = await model.generateContent(extractionPrompt);
                let jsonText = aiResult.response.text().trim();
                jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
                const geminiData = JSON.parse(jsonText);
                
                if (geminiData.tax_id && geminiData.tax_id.length >= 12) {
                    parsedData = geminiData;
                    extractionSuccess = true;
                }
            } catch (geminiError) {}
        }

        if (extractionSuccess && parsedData && parsedData.tax_id && parsedData.tax_id.length >= 12) {
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

// ============================================
// FUNCIÓN PARA DESCARGAR PDF Y ENVIARLO COMO ARCHIVO
// ============================================
async function downloadAndSendInvoice(from, fullInvoice, businessName) {
    try {
        const pdfUrl = `https://www.facturapi.io/v2/invoices/${fullInvoice.id}/pdf`;
        console.log(`⬇️ Descargando PDF desde: ${pdfUrl}`);

        const response = await axios.get(pdfUrl, {
            headers: {
                'Authorization': `Bearer ${FACTURAPI_API_KEY}`
            },
            responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(response.data, 'binary');
        const fileName = `Factura_${fullInvoice.id}.pdf`;

        await sock.sendMessage(from, { 
            document: buffer,
            fileName: fileName,
            mimetype: 'application/pdf',
            caption: `🎉 *¡Factura Timbrada con Éxito!*\n\n*UUID:* ${fullInvoice.id}\n*Total:* $${fullInvoice.total}\n\nEl archivo PDF se ha adjuntado a este mensaje.`
        });

        console.log(`✅ PDF enviado exitosamente a ${from}`);
        return true;
    } catch (error) {
        console.error('❌ Error descargando o enviando PDF:', error.message);
        await sendMessageWithRetry(from, 
            `🎉 *¡Factura Timbrada con Éxito!*\n\n*UUID:* ${fullInvoice.id}\n*Total:* $${fullInvoice.total}\n\n*No se pudo adjuntar el PDF automáticamente. Copia este UUID y descárgalo desde tu portal de Facturapi.*`
        );
        return false;
    }
}



startBot().catch(console.error);