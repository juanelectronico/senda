// whatsapp-bot-final.cjs - VERSIÓN CORREGIDA
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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// ===== VARIABLES GLOBALES =====
let sock = null;
let qrCode = null;
let isConnected = false;
let reconnectTimer = null;  // 🟢 Control de reconexión
let isReconnecting = false; // 🟢 Evita múltiples reconexiones

// ===== RATE LIMITING =====
const userMessageCooldown = new Map();
const COOLDOWN_MS = 5000; // 5 segundos por usuario
const MAX_MESSAGES_PER_MINUTE = 10;

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
        reconnectAttempts: isReconnecting ? 1 : 0 
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
    
    // Limpiar timer anterior si existe
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

// ===== FUNCIÓN PRINCIPAL CORREGIDA =====
async function startBot() {
    console.log('🤖 Iniciando bot de WhatsApp con Gemini...');

    try {
        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        
        // ===== CONFIGURACIÓN DEL SOCKET CORREGIDA =====
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLink: false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,  // 🔥 PARCHE CRÍTICO
            connectTimeoutMs: 60000,
            qrTimeout: 60000,
            retryRequestDelayMs: 250,
            getMessage: async (key) => {
                return { conversation: 'Hola' };
            }
        });

        // ===== EVENTO DE CONEXIÓN CORREGIDO =====
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
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`📴 Conexión cerrada. Código: ${statusCode}`);
                
                if (shouldReconnect) {
                    await reconnectBot();  // 🟢 Reconexión controlada
                } else {
                    console.log('❌ Sesión cerrada permanentemente (LoggedOut). Borra la carpeta "sessions" y escanea el QR nuevamente.');
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // ===== MANEJADOR DE MENSAJES CORREGIDO =====
        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0) return;

                for (const msg of msgs) {
                    // 🔥 VALIDACIÓN MEJORADA
                    if (!msg?.message) continue;
                    if (msg.key.fromMe) continue;
                    
                    const from = msg.key.remoteJid;
                    if (!from) continue;
                    
                    // 🟢 PERMITIR GRUPOS PERO CON DIFERENTE MANEJO
                    const isGroup = from.includes('@g.us');
                    const isBroadcast = from.includes('@broadcast');
                    
                    // Saltar broadcasts pero procesar grupos
                    if (isBroadcast) continue;
                    
                    // Para grupos, verificar que mencionen al bot o tengan mensaje directo
                    if (isGroup) {
                        const botId = sock.user?.id?.split(':')[0];
                        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                        const isMentioned = mentioned.includes(sock.user?.id) || 
                                           msg.message.extendedTextMessage?.contextInfo?.participant === sock.user?.id;
                        
                        // Si es grupo pero no mencionan al bot, ignorar
                        if (!isMentioned) continue;
                    }

                    // Extraer texto del mensaje
                    const text = msg.message.conversation || 
                               msg.message.extendedTextMessage?.text || 
                               msg.message.ephemeralMessage?.message?.conversation ||
                               msg.message.ephemeralMessage?.message?.extendedTextMessage?.text || 
                               msg.message.imageMessage?.caption || 
                               msg.message.videoMessage?.caption || '';

                    if (!text) continue;

                    // 🟢 RATE LIMITING
                    const userKey = from;
                    const now = Date.now();
                    
                    // Verificar cooldown por usuario
                    if (userMessageCooldown.has(userKey)) {
                        const lastMessage = userMessageCooldown.get(userKey);
                        if (now - lastMessage < COOLDOWN_MS) {
                            console.log(`⏳ Rate limit para ${from.split('@')[0]}`);
                            continue;
                        }
                    }
                    
                    // Actualizar cooldown
                    userMessageCooldown.set(userKey, now);
                    
                    // Limpiar cooldown antiguos
                    if (userMessageCooldown.size > 1000) {
                        const oldEntries = Array.from(userMessageCooldown.entries())
                            .filter(([_, time]) => now - time > 60000);
                        oldEntries.forEach(([key]) => userMessageCooldown.delete(key));
                    }

                    // 🟢 LOG SEGURO (sin exponer datos completos)
                    const userPhone = from.split('@')[0];
                    const logText = text.length > 50 ? text.substring(0, 50) + '...' : text;
                    console.log(`📩 Mensaje de ${userPhone}${isGroup ? ' (grupo)' : ''}: ${logText}`);

                    // 🟢 PROCESAR MENSAJE DE FORMA ASÍNCRONA CON MANEJO DE ERRORES
                    try {
                        await handleMessage(from, text, isGroup);
                    } catch (err) {
                        console.error(`❌ Error procesando mensaje de ${userPhone}:`, err.message);
                        await sendMessage(from, '⚠️ Ocurrió un error procesando tu mensaje. Intenta de nuevo.');
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

// ===== MANEJADOR DE MENSAJES CORREGIDO =====
async function handleMessage(from, text, isGroup = false) {
    try {
        const phone = from.replace(/@s\.whatsapp\.net$/, '');
        console.log(`📞 Procesando número: ${phone}${isGroup ? ' (grupo)' : ''}`);

        let commerce = null;
        let dbError = null;
        
        try {
            // 🟢 VALIDACIÓN MEJORADA DE SUPABASE
            const result = await supabase
                .from('commerce')
                .select('*')
                .eq('phone', phone)
                .maybeSingle();  // 🟢 Usar maybeSingle en lugar de single
            
            commerce = result.data;
            dbError = result.error;
            
            if (dbError) {
                console.error('⚠️ Error Supabase:', dbError.message);
            }
        } catch (err) {
            console.error('⚠️ Error consultando Supabase:', err.message);
            dbError = err;
        }

        // 🟢 VALIDACIÓN DE COMERCIO
        if (dbError || !commerce || typeof commerce !== 'object') {
            console.log('🤖 Usuario no registrado en Senda');
            
            // 🟢 RESPUESTA DIFERENTE PARA GRUPOS
            if (isGroup) {
                await sendMessage(from, 
                    `👋 Hola! Soy Senda, asistente de facturación. \n\n` +
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
                    await sendMessage(from, response);
                } catch (geminiError) {
                    console.error('❌ Error con Gemini:', geminiError.message);
                    await sendMessage(from, 
                        '🤖 ¡Hola! Soy Senda, tu asistente.\n\n' +
                        'Para usar el bot, registra tu número en: https://senda.com/register\n\n' +
                        'Comandos: *hola*, *estado*, *factura*, *pagar*'
                    );
                }
            }
            return;
        }

        // 🟢 VALIDAR ESTRUCTURA DE DATOS
        if (!commerce.business_name || !commerce.phone) {
            console.error('⚠️ Datos de comercio incompletos:', commerce);
            await sendMessage(from, 
                '⚠️ Tu cuenta está incompleta. Contacta a soporte: https://senda.com/support'
            );
            return;
        }

        // 🟢 PROCESAR COMANDOS
        const lower = text.toLowerCase().trim();

        // Comandos principales
        const commands = {
            'hola': () => sendMessage(from, 
                `👋 ¡Hola ${commerce.business_name}!\n\n` +
                'Soy Senda, tu asistente de facturación.\n\n' +
                '📄 *factura* - Iniciar nueva factura\n' +
                '📊 *estado* - Ver tu cuenta\n' +
                '💰 *pagar* - Obtener link de pago\n' +
                'ℹ️ *ayuda* - Ver comandos'
            ),
            
            'factura': () => sendMessage(from,
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
            
            'estado': () => sendMessage(from,
                `📊 *Estado de tu cuenta*\n\n` +
                `🏢 ${commerce.business_name}\n` +
                `📱 ${commerce.phone}\n` +
                `📌 ${commerce.is_active ? '✅ Cuenta activa' : '⛔ Cuenta inactiva'}\n` +
                `💎 ${commerce.is_premium ? '⭐ Plan Premium' : '📄 Plan Gratuito'}\n` +
                `📄 Facturas emitidas: ${commerce.invoice_count || 0}/5\n` +
                `💰 Saldo pendiente: ${commerce.balance || '$0.00'}`
            ),
            
            'pagar': () => sendMessage(from,
                '💰 *Link de pago*\n\n' +
                'Activa tu cuenta por $50 MXN mensuales\n' +
                '🔗 Link de pago: https://senda.com/pagar\n\n' +
                '💳 Aceptamos:\n' +
                '• Tarjetas de crédito/débito\n' +
                '• Transferencia bancaria\n' +
                '• PayPal'
            ),
            
            'ayuda': () => sendMessage(from,
                'ℹ️ *Comandos disponibles:*\n\n' +
                '👋 *hola* - Ver menú principal\n' +
                '📄 *factura* - Iniciar facturación\n' +
                '📊 *estado* - Ver estado de cuenta\n' +
                '💰 *pagar* - Link de pago\n' +
                'ℹ️ *ayuda* - Este mensaje\n\n' +
                '❓ ¿Preguntas? Visita: https://senda.com/soporte'
            )
        };

        // Verificar comandos exactos
        if (commands[lower]) {
            await commands[lower]();
            return;
        }

        // 🟢 BÚSQUEDA DE COMANDOS PARCIALES
        const matchedCommand = Object.keys(commands).find(cmd => 
            lower.includes(cmd) && cmd.length > 2
        );

        if (matchedCommand) {
            await commands[matchedCommand]();
            return;
        }

        // Si no hay comando coincidente
        await sendMessage(from,
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
        await sendMessage(from, '⚠️ Ocurrió un error interno. Intenta de nuevo.');
    }
}

// ===== FUNCIÓN PARA ENVIAR MENSAJES =====
async function sendMessage(to, text) {
    try {
        if (!sock) {
            console.error('❌ Socket no disponible');
            return false;
        }

        const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
        console.log(`✅ Mensaje enviado a ${to.split('@')[0]}`);
        return true;
    } catch (error) {
        console.error(`⚠️ Falló el envío a ${to.split('@')[0]}:`, error.message);
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
}, 60000); // Revisar cada minuto