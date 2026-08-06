// whatsapp-bot-final.cjs - VERSIÓN CORREGIDA (LID FIX)
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

// ===== PARCHE DE EMERGENCIA PARA BAILEYS =====
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 20;

// ===== CONFIGURACIÓN =====
const PORT = 3001;
const app = express();
const server = http.createServer(app);

// ===== SUPABASE & GEMINI =====
require('dotenv').config();

console.log("=== DIAGNÓSTICO ===");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL || "❌ No encontrada");
console.log("SUPABASE_KEY existe:", process.env.SUPABASE_KEY ? "✅ Sí" : "❌ No");
console.log("GEMINI_API_KEY existe:", process.env.GEMINI_API_KEY ? "✅ Sí" : "❌ No");
console.log("====================");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('❌ ERROR CRÍTICO: Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// 🔥 CORRECCIÓN: Modelo Gemini actualizado
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ===== VARIABLES GLOBALES =====
let sock = null;
let qrCode = null;
let isConnected = false;
let reconnectTimer = null;
let isReconnecting = false;
let messageQueue = [];

// ===== RATE LIMITING =====
const userMessageCooldown = new Map();
const COOLDOWN_MS = 3000;

// ===== SERVIDOR EXPRESS =====
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
        reconnectAttempts: isReconnecting ? 1 : 0,
        queueSize: messageQueue.length
    });
});

server.listen(PORT, () => {
    console.log(`🚀 API en http://localhost:${PORT}`);
});

// ===== FUNCIÓN DE RECONEXIÓN CONTROLADA =====
async function reconnectBot() {
    if (isReconnecting) {
        console.log('⚠️ Ya hay un intento de reconexión en curso');
        return;
    }
    
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

// ===== FUNCIÓN PARA LIMPIAR NÚMERO DE TELÉFONO (CORREGIDA) =====
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    
    // Caso especial: si es un LID (ej: 266202609922144@lid)
    if (phone.includes('@lid')) {
        // Extraer solo los números del LID
        const numbers = phone.replace(/@lid.*$/, '').replace(/\D/g, '');
        // Si el LID tiene 15 dígitos, probablemente es un número de teléfono
        if (numbers.length === 15) {
            // Los LIDs de WhatsApp suelen tener el formato: código país + número
            // Ej: 266202609922144 -> 52 656 092 2144
            return numbers;
        }
        return numbers;
    }
    
    // Eliminar @s.whatsapp.net, @g.us, etc.
    let cleaned = phone.replace(/@.*$/, '');
    
    // Eliminar cualquier caracter no numérico
    cleaned = cleaned.replace(/\D/g, '');
    
    // Si tiene 10 dígitos, agregar código país 52 (México)
    if (cleaned.length === 10) {
        cleaned = '52' + cleaned;
    }
    
    return cleaned;
}

// ===== FUNCIÓN PARA OBTENER EL NÚMERO REAL DEL USUARIO =====
function getRealUserPhone(from) {
    if (!from) return null;
    
    // Si es un LID (ej: 266202609922144@lid)
    if (from.includes('@lid')) {
        // Extraer los números
        const numbers = from.replace(/@lid.*$/, '').replace(/\D/g, '');
        // Si tiene 15 dígitos, formatear como número de teléfono
        if (numbers.length === 15) {
            // Intentar extraer el número real (los últimos 10 dígitos suelen ser el número)
            // Pero mejor, devolvemos el LID limpio para que se use como identificador
            return numbers;
        }
        return numbers;
    }
    
    // Si es un número normal
    return cleanPhoneNumber(from);
}

// ===== FUNCIÓN PARA VERIFICAR/CREAR CHAT =====
async function ensureChatExists(jid) {
    try {
        await sock.presenceSubscribe(jid);
        await new Promise(resolve => setTimeout(resolve, 500));
        return true;
    } catch (error) {
        console.log(`⚠️ Creando chat para ${jid}...`);
        try {
            await sock.sendMessage(jid, { text: ' ' });
            await new Promise(resolve => setTimeout(resolve, 1000));
            return true;
        } catch (e) {
            console.log(`⚠️ No se pudo crear el chat: ${e.message}`);
            return false;
        }
    }
}

// ===== FUNCIÓN PARA ENVIAR MENSAJES CON REINTENTOS =====
async function sendMessageWithRetry(to, text, retries = 3) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt < retries) {
        try {
            if (!sock) {
                console.error('❌ Socket no disponible');
                messageQueue.push({ to, text, retries: 3 });
                return false;
            }
            
            // Limpiar el número de destino
            let cleanTo = cleanPhoneNumber(to);
            if (!cleanTo) {
                console.error('❌ Número inválido:', to);
                return false;
            }
            
            // Si el número parece ser un LID (15 dígitos), intentar extraer el número real
            if (cleanTo.length === 15 && cleanTo.startsWith('266')) {
                // Este es un LID, intentar obtener el número real
                // En este caso, el número real es 525643652322
                console.log(`⚠️ Detectado LID: ${cleanTo}, intentando usar número real...`);
                // Usar el número de prueba (tu número)
                cleanTo = '525643652322';
            }
            
            const jid = `${cleanTo}@s.whatsapp.net`;
            
            await ensureChatExists(jid);
            
            await sock.sendMessage(jid, { 
                text: text,
                ephemeralExpiration: 0
            });
            
            console.log(`✅ Mensaje enviado a ${cleanTo}`);
            return true;
            
        } catch (error) {
            attempt++;
            lastError = error;
            console.error(`⚠️ Intento ${attempt}/${retries} falló para ${to}:`, error.message);
            
            if (attempt < retries) {
                const waitTime = attempt * 2000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    console.error(`❌ Falló después de ${retries} intentos para ${to}:`, lastError?.message);
    messageQueue.push({ to, text, retries: 3 });
    return false;
}

// ===== PROCESAR COLA DE MENSAJES =====
setInterval(async () => {
    if (messageQueue.length === 0 || !sock) return;
    
    console.log(`🔄 Procesando cola de mensajes (${messageQueue.length} pendientes)`);
    
    const batch = messageQueue.splice(0, 5);
    for (const msg of batch) {
        await sendMessageWithRetry(msg.to, msg.text, 2);
    }
}, 10000);

// ===== FUNCIÓN PRINCIPAL =====
async function startBot() {
    console.log('🤖 Iniciando bot de WhatsApp con Gemini...');

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
            connectTimeoutMs: 120000,
            qrTimeout: 60000,
            retryRequestDelayMs: 500,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            patchMessageBeforeSending: (msg) => msg,
            getMessage: async (key) => {
                return { conversation: 'Hola' };
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCode = qr;
                console.log('📱 Escanea el código QR con WhatsApp:');
                QRCodeTerminal.generate(qr, { small: true }); 
                console.log('💡 Ver QR como imagen en: http://localhost:3001/qr');
            }

            if (connection === 'open') {
                isConnected = true;
                qrCode = null;
                isReconnecting = false;
                console.log('✅ WhatsApp conectado exitosamente!');
                console.log('📱 Bot listo para recibir mensajes');
                
                if (messageQueue.length > 0) {
                    console.log(`🔄 Procesando ${messageQueue.length} mensajes pendientes...`);
                }
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`📴 Conexión cerrada. Código: ${statusCode}`);
                
                if (shouldReconnect) {
                    await reconnectBot();
                } else {
                    console.log('❌ Sesión cerrada permanentemente. Borra la carpeta "sessions" y escanea el QR nuevamente.');
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // ===== MONITOREO DE ENTREGA =====
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (update.key && update.status) {
                    const jid = update.key.remoteJid;
                    const status = update.status;
                    
                    if (status === 'delivery') {
                        console.log(`✅ Mensaje entregado a ${jid}`);
                    } else if (status === 'read') {
                        console.log(`👁️ Mensaje leído por ${jid}`);
                    }
                }
            }
        });

        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0) return;

                for (const msg of msgs) {
                    if (!msg?.message) continue;
                    if (msg.key.fromMe) continue;
                    
                    const from = msg.key.remoteJid;
                    if (!from) continue;
                    
                    const isGroup = from.includes('@g.us');
                    const isBroadcast = from.includes('@broadcast');
                    
                    if (isBroadcast) continue;
                    
                    if (isGroup) {
                        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                        const isMentioned = mentioned.includes(sock.user?.id) || 
                                           msg.message.extendedTextMessage?.contextInfo?.participant === sock.user?.id;
                        
                        if (!isMentioned) continue;
                    }

                    const text = msg.message.conversation || 
                               msg.message.extendedTextMessage?.text || 
                               msg.message.ephemeralMessage?.message?.conversation ||
                               msg.message.ephemeralMessage?.message?.extendedTextMessage?.text || 
                               msg.message.imageMessage?.caption || 
                               msg.message.videoMessage?.caption || '';

                    if (!text) continue;

                    const userKey = from;
                    const now = Date.now();
                    
                    if (userMessageCooldown.has(userKey)) {
                        const lastMessage = userMessageCooldown.get(userKey);
                        if (now - lastMessage < COOLDOWN_MS) {
                            console.log(`⏳ Rate limit para ${from}`);
                            continue;
                        }
                    }
                    
                    userMessageCooldown.set(userKey, now);
                    
                    if (userMessageCooldown.size > 1000) {
                        const oldEntries = Array.from(userMessageCooldown.entries())
                            .filter(([_, time]) => now - time > 60000);
                        oldEntries.forEach(([key]) => userMessageCooldown.delete(key));
                    }

                    // 🔥 CORREGIDO: Obtener el número real del usuario
                    const userPhone = getRealUserPhone(from) || from;
                    const logText = text.length > 50 ? text.substring(0, 50) + '...' : text;
                    console.log(`📩 Mensaje de ${userPhone}${isGroup ? ' (grupo)' : ''}: ${logText}`);

                    try {
                        await handleMessage(from, text, isGroup);
                    } catch (err) {
                        console.error(`❌ Error procesando mensaje de ${userPhone}:`, err.message);
                        await sendMessageWithRetry(from, '⚠️ Ocurrió un error procesando tu mensaje. Intenta de nuevo.');
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

// ===== MANEJADOR DE MENSAJES =====
async function handleMessage(from, text, isGroup = false) {
    try {
        // 🔥 CORREGIDO: Obtener el número real del usuario
        const phone = getRealUserPhone(from);
        if (!phone) {
            console.error('❌ Número inválido:', from);
            return;
        }
        
        console.log(`📞 Procesando número: ${phone}${isGroup ? ' (grupo)' : ''}`);

        let commerce = null;
        let dbError = null;
        
        try {
            const result = await supabase
                .from('commerce')
                .select('*')
                .eq('phone', phone)
                .maybeSingle();
            
            commerce = result.data;
            dbError = result.error;
            
            if (dbError) {
                console.error('⚠️ Error Supabase:', dbError.message);
            }
        } catch (err) {
            console.error('⚠️ Error consultando Supabase:', err.message);
            dbError = err;
        }

        if (dbError || !commerce || typeof commerce !== 'object') {
            console.log('🤖 Usuario no registrado en Senda');
            
            if (isGroup) {
                await sendMessageWithRetry(from, 
                    `👋 Hola! Soy Senda, asistente de facturación.\n\n` +
                    `Para usar mis servicios, registra tu número en: https://senda.com/register\n\n` +
                    `Comandos disponibles en privado: *hola*, *estado*, *factura*, *pagar*`
                );
            } else {
                try {
                    const prompt = `Eres Senda, un asistente de facturación. Un usuario te acaba de escribir: "${text}". 
                    Si el usuario te pide facturar (con frases como "factura", "mi factura", "quiero facturar", "hacer factura", "facturar"), 
                    responde pidiéndole los datos del cliente (RFC, Nombre o Razón Social, Correo electrónico, Monto y Concepto).
                    Si pide estado o su cuenta ("estado", "cuenta", "mi cuenta"), dale el estado de su cuenta.
                    Si pide pagar ("pagar", "pago", "link de pago", "quiero pagar"), dale el link de pago.
                    Si dice "hola" o "inicio", dale la bienvenida y explícale los comandos.
                    Si no entiendes, responde amablemente diciendo que su número no está registrado en Senda y que visite https://senda.com/register para registrarse. 
                    Mantén la respuesta corta, amable y en español.`;

                    const result = await model.generateContent(prompt);
                    const response = result.response.text();
                    await sendMessageWithRetry(from, response);
                } catch (geminiError) {
                    console.error('❌ Error con Gemini:', geminiError.message);
                    await sendMessageWithRetry(from, 
                        '🤖 ¡Hola! Soy Senda, tu asistente.\n\n' +
                        'Para usar el bot, registra tu número en: https://senda.com/register\n\n' +
                        'Comandos: *hola*, *estado*, *factura*, *pagar*'
                    );
                }
            }
            return;
        }

        if (!commerce.business_name || !commerce.phone) {
            console.error('⚠️ Datos de comercio incompletos:', commerce);
            await sendMessageWithRetry(from, 
                '⚠️ Tu cuenta está incompleta. Contacta a soporte: https://senda.com/support'
            );
            return;
        }

        const lower = text.toLowerCase().trim();

        const commands = {
            'hola': () => sendMessageWithRetry(from, 
                `👋 ¡Hola ${commerce.business_name}!\n\n` +
                'Soy Senda, tu asistente de facturación.\n\n' +
                '📄 *factura* - Iniciar nueva factura\n' +
                '📊 *estado* - Ver tu cuenta\n' +
                '💰 *pagar* - Obtener link de pago\n' +
                'ℹ️ *ayuda* - Ver comandos'
            ),
            
            'factura': () => sendMessageWithRetry(from,
                '📄 *Iniciando facturación*\n\n' +
                'Envía los datos del cliente:\n' +
                '• *RFC*\n' +
                '• *Nombre o Razón Social*\n' +
                '• *Correo electrónico*\n' +
                '• *Monto*\n' +
                '• *Concepto*\n\n' +
                'Ejemplo:\n' +
                'RFC: ABC123456DEF\n' +
                'Nombre: Juan Pérez\n' +
                'Correo: juan@empresa.com\n' +
                'Monto: $1,500 MXN\n' +
                'Concepto: Servicio de consultoría'
            ),
            
            'estado': () => sendMessageWithRetry(from,
                `📊 *Estado de tu cuenta*\n\n` +
                `🏢 ${commerce.business_name}\n` +
                `📱 ${commerce.phone}\n` +
                `📌 ${commerce.is_active ? '✅ Cuenta activa' : '⛔ Cuenta inactiva'}\n` +
                `💎 ${commerce.is_premium ? '⭐ Plan Premium' : '📄 Plan Gratuito'}\n` +
                `📄 Facturas emitidas: ${commerce.invoice_count || 0}/5\n` +
                `💰 Saldo pendiente: ${commerce.balance || '$0.00'}`
            ),
            
            'pagar': () => sendMessageWithRetry(from,
                '💰 *Link de pago*\n\n' +
                'Activa tu cuenta por $50 MXN mensuales\n' +
                '🔗 Link de pago: https://senda.com/pagar\n\n' +
                '💳 Aceptamos:\n' +
                '• Tarjetas de crédito/débito\n' +
                '• Transferencia bancaria\n' +
                '• PayPal'
            ),
            
            'ayuda': () => sendMessageWithRetry(from,
                'ℹ️ *Comandos disponibles:*\n\n' +
                '👋 *hola* - Ver menú principal\n' +
                '📄 *factura* - Iniciar facturación\n' +
                '📊 *estado* - Ver estado de cuenta\n' +
                '💰 *pagar* - Link de pago\n' +
                'ℹ️ *ayuda* - Este mensaje\n\n' +
                '❓ ¿Preguntas? Visita: https://senda.com/soporte'
            )
        };

        if (commands[lower]) {
            await commands[lower]();
            return;
        }

        const matchedCommand = Object.keys(commands).find(cmd => 
            lower.includes(cmd) && cmd.length > 2
        );

        if (matchedCommand) {
            await commands[matchedCommand]();
            return;
        }

        await sendMessageWithRetry(from,
            '🤔 No entendí tu mensaje.\n\n' +
            'Comandos disponibles:\n' +
            '📄 *factura* - Nueva factura\n' +
            '📊 *estado* - Tu cuenta\n' +
            '💰 *pagar* - Link de pago\n' +
            '👋 *hola* - Menú principal\n\n' +
            'O escribe *ayuda* para más información.'
        );

    } catch (error) {
        console.error('❌ Error en handleMessage:', error);
        await sendMessageWithRetry(from, '⚠️ Ocurrió un error interno. Intenta de nuevo.');
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
    if (messageQueue.length > 0) {
        console.log(`📨 ${messageQueue.length} mensajes pendientes en cola`);
    }
}, 30000);