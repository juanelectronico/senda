var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Convertir;
chat;
a;
PDF;
Convertir;
chat;
a;
PDF;
Abrir;
este;
chat;
en;
Acrobat;
Conversación;
con;
Gemini;
dame;
codigo;
completo;
JavaScript;
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
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
        }
        catch (error) {
            console.error('❌ Error generando QR:', error);
            res.status(500).json({ error: 'Error generando QR' });
        }
    }
    else {
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
    if (isReconnecting)
        return;
    isReconnecting = true;
    console.log('🔄 Intentando reconexión en 5 segundos...');
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectTimer = setTimeout(async () => {
        try {
            await startBot();
        }
        catch (error) {
            console.error('❌ Error en reconexión:', error);
        }
        finally {
            isReconnecting = false;
            reconnectTimer = null;
        }
    }, 5000);
}
function cleanPhoneNumber(phone) {
    if (!phone)
        return null;
    let raw = String(phone).replace(/\D/g, '');
    if (raw.length === 10)
        return '52' + raw;
    if (raw.length === 12)
        return raw;
    if (raw.length === 13 && raw.startsWith('521'))
        return '52' + raw.substring(3);
    return raw;
}
function getRealUserPhone(from, msg = null) {
    if (!from)
        return null;
    if (from.includes('@g.us') || from.includes('@broadcast')) {
        return null;
    }
    if (from.includes('@s.whatsapp.net')) {
        let num = from.split('@')[0];
        if (num.length <= 15) {
            return cleanPhoneNumber(num);
        }
    }
    if (msg) {
        const participant = msg.key?.participant || msg.message?.extendedTextMessage?.contextInfo?.participant;
        if (participant) {
            let cleanPart = participant.replace(/@.*$/, '').replace(/\D/g, '');
            if (cleanPart.length >= 10 && cleanPart.length <= 13) {
                return cleanPhoneNumber(cleanPart);
            }
        }
    }
    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');
    if (raw.length <= 15) {
        return cleanPhoneNumber(raw);
    }
    return null;
}
async function sendMessageWithRetry(to, text, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            if (!sock) {
                messageQueue.push({ to, text, retries: 3 });
                return false;
            }
            let cleanTo = cleanPhoneNumber(to);
            if (!cleanTo)
                return false;
            const jid = `${cleanTo}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: text });
            console.log(`✅ Mensaje enviado exitosamente a ${cleanTo}`);
            return true;
        }
        catch (error) {
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
    if (messageQueue.length === 0 || !sock)
        return;
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
                }
                else {
                    console.log('❌ Sesión cerrada. Borra la carpeta "sessions" y escanea el QR del comercio nuevamente.');
                }
            }
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0)
                    return;
                for (const msg of msgs) {
                    if (!msg?.message)
                        continue;
                    if (msg.key.fromMe)
                        continue;
                    const from = msg.key.remoteJid;
                    if (!from || from.includes('@broadcast') || from.includes('@g.us'))
                        continue;
                    const text = msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        msg.message.ephemeralMessage?.message?.conversation ||
                        msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                        msg.message.imageMessage?.caption || '';
                    if (!text)
                        continue;
                    const clientPhone = getRealUserPhone(from, msg);
                    if (!clientPhone)
                        continue;
                    const userKey = clientPhone;
                    const now = Date.now();
                    if (userMessageCooldown.has(userKey) && now - userMessageCooldown.get(userKey) < COOLDOWN_MS) {
                        continue;
                    }
                    userMessageCooldown.set(userKey, now);
                    console.log(`📩 Mensaje de cliente ${clientPhone}: ${text}`);
                    try {
                        await handleClientMessage(from, text, clientPhone, msg);
                    }
                    catch (err) {
                        console.error(`❌ Error procesando mensaje de cliente:`, err.message);
                        await sendMessageWithRetry(from, '⚠️ Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.');
                    }
                }
            }
            catch (error) {
                console.error('❌ Error en messages.upsert:', error);
            }
        });
    }
    catch (error) {
        console.error('❌ Error iniciando bot:', error);
        await reconnectBot();
    }
}
async function handleClientMessage(from, text, clientPhone, msg) {
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
    }
    catch (err) {
        console.error('⚠️ Error consultando comercio en Supabase:', err.message);
    }
    const businessName = commerce?.business_name || "nuestro establecimiento";
    const lower = text.toLowerCase().trim();
    if (lower.includes('factura') || lower.includes('facturar')) {
        await sendMessageWithRetry(from, `📄 *Solicitud de Factura - ${businessName}*\n\n` +
            `Para generar tu factura, por favor envíanos los siguientes datos en un solo mensaje:\n` +
            `• *RFC*\n` +
            `• *Nombre o Razón Social*\n` +
            `• *Correo electrónico*\n` +
            `• *Monto de compra*\n` +
            `• *Número de ticket o concepto*\n\n` +
            `En breve un asesor o el sistema validará tu información.`);
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
    }
    catch (geminiError) {
        await sendMessageWithRetry(from, `👋 ¡Hola! Gracias por comunicarte con *${businessName}*.\n\n` +
            `¿En qué podemos ayudarte hoy? Si necesitas factura, escribe la palabra *factura*.`);
    }
}
process.on('SIGINT', async () => {
    if (sock) {
        try {
            await sock.ws.close();
        }
        catch (err) { }
    }
    process.exit(0);
});
process.on('SIGTERM', async () => {
    if (sock) {
        try {
            await sock.ws.close();
        }
        catch (err) { }
    }
    process.exit(0);
});
startBot().catch(console.error);
Comparar;
con;
GPT - 5.5;
listo;
ahora ?
    Ahora : ;
que;
ya;
guardaste;
el;
archivo;
con;
el;
código;
completo;
y;
corregido, haz;
lo;
siguiente;
en;
tu;
consola: Detén;
cualquier;
proceso;
anterior: PowerShell;
Stop - Process - Name;
"node" - Force;
Ejecuta;
el;
bot: PowerShell;
node;
whatsapp - bot - final.cjs;
Prueba;
enviando;
un;
mensaje;
desde;
el;
celular;
del;
cliente;
y;
verifica;
en;
la;
consola;
que;
el;
número;
de;
teléfono;
aparezca;
correctamente;
y;
la;
respuesta;
llegue;
al;
chat.
;
Comparar;
con;
GPT - 5.5;
sigue;
sin;
reconocer;
el;
numero;
del;
cliente;
aileys;
",";
msg;
":";
12;
pre - keys;
found;
on;
server;
"};
{
    "level";
    30, "time";
    "2026-08-06T18:09:41.193Z", "pid";
    7608, "hostname";
    "juan", "class";
    "baileys", "msg";
    "opened connection to WA";
}
WhatsApp;
del;
Comercio;
conectado;
exitosamente(Número, 525670500038);
Mensaje;
de;
cliente;
266202609922144;
Hola;
El;
motivo;
por;
el;
cual;
Baileys;
sigue;
imprimiendo;
266202609922144;
es;
que;
WhatsApp;
Web;
actual(multidispositivo);
está;
enviando;
el;
mensaje;
usando;
un;
identificador;
interno;
cifrado(LID);
en;
lugar;
de;
exponer;
el;
JID;
con;
el;
número;
de;
teléfono;
tradicional().
;
Para;
resolverlo;
de;
forma;
definitiva;
y;
forzar;
a;
Baileys;
a;
extraer;
el;
número;
real;
o;
usar;
el;
JID;
alternativo;
que;
viene;
en;
la;
clave;
del;
mensaje, vamos;
a;
actualizar;
la;
función;
getRealUserPhone;
para;
que;
verifique;
si;
el;
objeto;
msg.key;
trae;
el;
número;
real;
o;
si;
podemos;
extraerlo;
directamente;
del;
emisor.
;
Actualiza;
únicamente;
la;
función;
getRealUserPhone;
en;
tu;
archivo;
con;
esta;
versión;
que;
detecta;
cuando;
es;
un;
LID;
y;
busca;
el;
teléfono;
verdadero: JavaScript;
function getRealUserPhone(from, msg = null) {
    if (!from)
        return null;
    if (from.includes('@g.us') || from.includes('@broadcast')) {
        return null;
    }
    // Si el remoteJid ya es un número tradicional
    if (from.endsWith('@s.whatsapp.net') && !from.startsWith('266')) {
        let num = from.split('@')[0];
        if (num.length <= 13)
            return cleanPhoneNumber(num);
    }
    // Si viene como LID o número interno, buscamos en los datos del mensaje si hay un JID alternativo
    if (msg) {
        // A veces el verdadero JID o número viene en participant o remoteJid alternativo
        const altJid = msg.key?.participant || msg.participant;
        if (altJid) {
            let cleanAlt = altJid.replace(/@.*$/, '').replace(/\D/g, '');
            if (cleanAlt.length >= 10 && cleanAlt.length <= 13) {
                return cleanPhoneNumber(cleanAlt);
            }
        }
    }
    // Si Baileys nos pasa el número largo, intentamos ver si podemos mapearlo o si el cliente está escribiendo desde una cuenta vinculada. 
    // Como respaldo temporal para que el bot responda al chat correcto, usamos el 'from' original para enviar el mensaje:
    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');
    if (raw.length > 13) {
        // Si es un LID puro de WhatsApp, devolvemos el JID completo para que sock.sendMessage pueda responderle al chat correcto
        return from;
    }
    return cleanPhoneNumber(raw);
}
Y;
asegúrate;
de;
que;
al;
momento;
de;
responder;
en;
messages.upsert;
y;
handleClientMessage, utilices;
directamente;
la;
variable;
from(que, contiene, el, JID, exacto, que, abrió, la, sesión, con, el, bot);
para;
que;
el;
mensaje;
siempre;
llegue;
a;
su;
destino;
sin;
importar;
si;
es;
un;
número;
tradicional;
o;
un;
LID: JavaScript;
await handleClientMessage(from, text, clientPhone, msg);
Comparar;
con;
GPT - 5.5;
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
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
        }
        catch (error) {
            console.error('❌ Error generando QR:', error);
            res.status(500).json({ error: 'Error generando QR' });
        }
    }
    else {
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
    if (isReconnecting)
        return;
    isReconnecting = true;
    console.log('🔄 Intentando reconexión en 5 segundos...');
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectTimer = setTimeout(async () => {
        try {
            await startBot();
        }
        catch (error) {
            console.error('❌ Error en reconexión:', error);
        }
        finally {
            isReconnecting = false;
            reconnectTimer = null;
        }
    }, 5000);
}
function cleanPhoneNumber(phone) {
    if (!phone)
        return null;
    let raw = String(phone).replace(/\D/g, '');
    if (raw.length === 10)
        return '52' + raw;
    if (raw.length === 12)
        return raw;
    if (raw.length === 13 && raw.startsWith('521'))
        return '52' + raw.substring(3);
    return raw;
}
function getRealUserPhone(from, msg = null) {
    if (!from)
        return null;
    if (from.includes('@g.us') || from.includes('@broadcast')) {
        return null;
    }
    if (from.includes('@s.whatsapp.net')) {
        let num = from.split('@')[0];
        if (num.length <= 15) {
            return cleanPhoneNumber(num);
        }
    }
    if (msg) {
        const participant = msg.key?.participant || msg.message?.extendedTextMessage?.contextInfo?.participant;
        if (participant) {
            let cleanPart = participant.replace(/@.*$/, '').replace(/\D/g, '');
            if (cleanPart.length >= 10 && cleanPart.length <= 13) {
                return cleanPhoneNumber(cleanPart);
            }
        }
    }
    let raw = from.replace(/@.*$/, '').replace(/\D/g, '');
    if (raw.length <= 15) {
        return cleanPhoneNumber(raw);
    }
    return null;
}
async function sendMessageWithRetry(to, text, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            if (!sock) {
                messageQueue.push({ to, text, retries: 3 });
                return false;
            }
            let cleanTo = cleanPhoneNumber(to);
            if (!cleanTo)
                return false;
            const jid = `${cleanTo}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: text });
            console.log(`✅ Mensaje enviado exitosamente a ${cleanTo}`);
            return true;
        }
        catch (error) {
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
    if (messageQueue.length === 0 || !sock)
        return;
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
                }
                else {
                    console.log('❌ Sesión cerrada. Borra la carpeta "sessions" y escanea el QR del comercio nuevamente.');
                }
            }
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0)
                    return;
                for (const msg of msgs) {
                    if (!msg?.message)
                        continue;
                    if (msg.key.fromMe)
                        continue;
                    const from = msg.key.remoteJid;
                    if (!from || from.includes('@broadcast') || from.includes('@g.us'))
                        continue;
                    const text = msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        msg.message.ephemeralMessage?.message?.conversation ||
                        msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                        msg.message.imageMessage?.caption || '';
                    if (!text)
                        continue;
                    const clientPhone = getRealUserPhone(from, msg);
                    if (!clientPhone)
                        continue;
                    const userKey = clientPhone;
                    const now = Date.now();
                    if (userMessageCooldown.has(userKey) && now - userMessageCooldown.get(userKey) < COOLDOWN_MS) {
                        continue;
                    }
                    userMessageCooldown.set(userKey, now);
                    console.log(`📩 Mensaje de cliente ${clientPhone}: ${text}`);
                    try {
                        await handleClientMessage(from, text, clientPhone, msg);
                    }
                    catch (err) {
                        console.error(`❌ Error procesando mensaje de cliente:`, err.message);
                        await sendMessageWithRetry(from, '⚠️ Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.');
                    }
                }
            }
            catch (error) {
                console.error('❌ Error en messages.upsert:', error);
            }
        });
    }
    catch (error) {
        console.error('❌ Error iniciando bot:', error);
        await reconnectBot();
    }
}
async function handleClientMessage(from, text, clientPhone, msg) {
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
    }
    catch (err) {
        console.error('⚠️ Error consultando comercio en Supabase:', err.message);
    }
    const businessName = commerce?.business_name || "nuestro establecimiento";
    const lower = text.toLowerCase().trim();
    if (lower.includes('factura') || lower.includes('facturar')) {
        await sendMessageWithRetry(from, `📄 *Solicitud de Factura - ${businessName}*\n\n` +
            `Para generar tu factura, por favor envíanos los siguientes datos en un solo mensaje:\n` +
            `• *RFC*\n` +
            `• *Nombre o Razón Social*\n` +
            `• *Correo electrónico*\n` +
            `• *Monto de compra*\n` +
            `• *Número de ticket o concepto*\n\n` +
            `En breve un asesor o el sistema validará tu información.`);
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
    }
    catch (geminiError) {
        await sendMessageWithRetry(from, `👋 ¡Hola! Gracias por comunicarte con *${businessName}*.\n\n` +
            `¿En qué podemos ayudarte hoy? Si necesitas factura, escribe la palabra *factura*.`);
    }
}
process.on('SIGINT', async () => {
    if (sock) {
        try {
            await sock.ws.close();
        }
        catch (err) { }
    }
    process.exit(0);
});
process.on('SIGTERM', async () => {
    if (sock) {
        try {
            await sock.ws.close();
        }
        catch (err) { }
    }
    process.exit(0);
});
startBot().catch(console.error);
El;
problema;
con;
el;
número;
266202609922144;
se;
debe;
a;
que;
WhatsApp;
implementó;
el;
sistema;
de;
LID(Linked, ID);
en;
cuentas;
vinculadas;
y;
multidispositivo.Cuando;
un;
cliente;
te;
escribe, WhatsApp;
a;
veces;
oculta;
su;
número;
real;
en;
el;
evento;
de;
entrada;
y;
entrega;
un;
identificador;
interno;
cifrado(LID);
que;
termina;
en;
o;
aparece;
numéricamente;
sin;
el;
sufijo;
tradicional;
intentas;
tratar;
ese;
ID;
largo;
como;
un;
teléfono, obviamente;
no;
coincide;
con;
un;
número;
real;
de;
México.
;
Para;
solucionarlo;
definitivamente, debemos;
hacer;
dos;
cosas;
en;
el;
código: Si;
el;
identificador;
recibido;
es;
un;
LID(es, decir, un, número, largo, o, extraño, que, no, es, un, teléfono, válido), guardamos;
y;
respondemos;
usando;
directamente;
ese;
identificador(from);
para;
que;
el;
mensaje;
llegue;
al;
chat;
correcto.
;
Actualizamos;
la;
función;
getRealUserPhone;
para;
que;
acepte;
tanto;
números;
tradicionales;
como;
LIDs;
sin;
bloquearlos.
;
Aquí;
tienes;
el;
código;
completo;
corregido: JavaScript;
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
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
        }
        catch (error) {
            console.error('❌ Error generando QR:', error);
            res.status(500).json({ error: 'Error generando QR' });
        }
    }
    else {
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
    if (isReconnecting)
        return;
    isReconnecting = true;
    console.log('🔄 Intentando reconexión en 5 segundos...');
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectTimer = setTimeout(async () => {
        try {
            await startBot();
        }
        catch (error) {
            console.error('❌ Error en reconexión:', error);
        }
        finally {
            isReconnecting = false;
            reconnectTimer = null;
        }
    }, 5000);
}
function cleanPhoneNumber(phone) {
    if (!phone)
        return null;
    let raw = String(phone).replace(/\D/g, '');
    if (raw.length === 10)
        return '52' + raw;
    if (raw.length === 12)
        return raw;
    if (raw.length === 13 && raw.startsWith('521'))
        return '52' + raw.substring(3);
    return raw;
}
// Función actualizada para manejar tanto números normales como IDs internos (LID)
function getRealUserPhone(from, msg = null) {
    if (!from)
        return null;
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
                if (!cleanTo)
                    return false;
                jid = `${cleanTo}@s.whatsapp.net`;
            }
            await sock.sendMessage(jid, { text: text });
            console.log(`✅ Mensaje enviado exitosamente a ${to}`);
            return true;
        }
        catch (error) {
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
    if (messageQueue.length === 0 || !sock)
        return;
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
                }
                else {
                    console.log('❌ Sesión cerrada. Borra la carpeta "sessions" y escanea el QR del comercio nuevamente.');
                }
            }
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', async (msgUpdate) => {
            try {
                const msgs = msgUpdate.messages;
                if (!msgs || msgs.length === 0)
                    return;
                for (const msg of msgs) {
                    if (!msg?.message)
                        continue;
                    if (msg.key.fromMe)
                        continue;
                    const from = msg.key.remoteJid;
                    if (!from || from.includes('@broadcast') || from.includes('@g.us'))
                        continue;
                    const text = msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        msg.message.ephemeralMessage?.message?.conversation ||
                        msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                        msg.message.imageMessage?.caption || '';
                    if (!text)
                        continue;
                    const clientIdentifier = getRealUserPhone(from, msg);
                    if (!clientIdentifier)
                        continue;
                    const userKey = clientIdentifier;
                    const now = Date.now();
                    if (userMessageCooldown.has(userKey) && now - userMessageCooldown.get(userKey) < COOLDOWN_MS) {
                        continue;
                    }
                    userMessageCooldown.set(userKey, now);
                    console.log(`📩 Mensaje recibido de ${clientIdentifier}: ${text}`);
                    try {
                        await handleClientMessage(from, text, clientIdentifier, msg);
                    }
                    catch (err) {
                        console.error(`❌ Error procesando mensaje de cliente:`, err.message);
                        await sendMessageWithRetry(from, '⚠️ Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.');
                    }
                }
            }
            catch (error) {
                console.error('❌ Error en messages.upsert:', error);
            }
        });
    }
    catch (error) {
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
    }
    catch (err) {
        console.error('⚠️ Error consultando comercio en Supabase:', err.message);
    }
    const businessName = commerce?.business_name || "nuestro establecimiento";
    const lower = text.toLowerCase().trim();
    if (lower.includes('factura') || lower.includes('facturar')) {
        await sendMessageWithRetry(from, `📄 *Solicitud de Factura - ${businessName}*\n\n` +
            `Para generar tu factura, por favor envíanos los siguientes datos en un solo mensaje:\n` +
            `• *RFC*\n` +
            `• *Nombre o Razón Social*\n` +
            `• *Correo electrónico*\n` +
            `• *Monto de compra*\n` +
            `• *Número de ticket o concepto*\n\n` +
            `En breve un asesor o el sistema validará tu información.`);
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
    }
    catch (geminiError) {
        await sendMessageWithRetry(from, `👋 ¡Hola! Gracias por comunicarte con *${businessName}*.\n\n` +
            `¿En qué podemos ayudarte hoy? Si necesitas factura, escribe la palabra *factura*.`);
    }
}
process.on('SIGINT', async () => {
    if (sock) {
        try {
            await sock.ws.close();
        }
        catch (err) { }
    }
    process.exit(0);
});
process.on('SIGTERM', async () => {
    if (sock) {
        try {
            await sock.ws.close();
        }
        catch (err) { }
    }
    process.exit(0);
});
startBot().catch(console.error);
Comparar;
con;
GPT - 5.5;
listo;
ahora ?
    Ahora : ;
guarda;
este;
código;
en;
tu;
archivo;
whatsapp - bot - final.cjs, asegúrate;
de;
que;
el;
proceso;
anterior;
esté;
cerrado;
y;
vuelve;
a;
ejecutarlo;
en;
tu;
terminal: PowerShell;
node;
whatsapp - bot - final.cjs;
Envía;
un;
mensaje;
de;
prueba;
desde;
tu;
otro;
teléfono;
y;
verás;
que;
el;
bot;
responderá;
inmediatamente;
al;
chat;
de;
forma;
correcta, utilizando;
el;
identificador;
que;
WhatsApp;
le;
asignó.
;
Comparar;
con;
GPT - 5.5;
esto;
en;
consola;
"baileys", "msg";
"12 pre-keys found on server";
{
    "level";
    30, "time";
    "2026-08-06T18:15:46.380Z", "pid";
    10416, "hostname";
    "juan", "class";
    "baileys", "msg";
    "opened connection to WA";
}
WhatsApp;
del;
Comercio;
conectado;
exitosamente(Número, 525670500038);
Mensaje;
recibido;
de;
266202609922144;
Hola;
Mensaje;
enviado;
exitosamente;
a;
266202609922144;
en;
whatsap;
ya;
dio;
respuesta;
Excelente;
noticia;
Como;
puedes;
ver;
en;
los;
logs, el;
bot;
ya;
está;
recibiendo;
el;
identificador(266202609922144, ), lo;
procesa;
correctamente;
y;
envía;
el;
mensaje;
de;
vuelta;
al;
chat;
exacto;
sin;
errores, por;
lo;
que;
la;
respuesta;
ya;
llegó;
exitosamente;
al;
WhatsApp;
del;
cliente.
;
El;
sistema;
ya;
quedó;
funcional;
y;
listo;
para;
atender;
solicitudes;
y;
gestionar;
las;
peticiones;
de;
facturas.
;
Comparar;
con;
GPT - 5.5;
subamos;
de;
volada;
a;
git;
hub;
Ejecuta;
los;
siguientes;
comandos;
en;
tu;
consola;
de;
PowerShell;
para;
subir;
el;
proyecto;
a;
GitHub;
de;
forma;
rápida;
y;
limpia: Inicializa;
Git(si, aún, no, está, inicializado);
PowerShell;
git;
init;
Crea;
el;
archivo.gitignore;
para;
proteger;
tus;
credenciales;
y;
no;
subir;
la;
sesión;
ni;
las;
dependencias: PowerShell;
"sessions/" | Out - File - Encoding;
utf8.gitignore;
"node_modules/" | Out - File - Encoding;
utf8 - Append.gitignore;
".env" | Out - File - Encoding;
utf8 - Append.gitignore;
Agrega;
todos;
los;
archivos;
y;
haz;
el;
commit: PowerShell;
git;
add.
;
git;
commit - m;
"Bot de WhatsApp Senda configurado y funcionando";
Conecta;
tu;
repositorio;
remoto;
y;
sube;
los;
cambios(reemplaza, la, URL, con, la, de, tu, repositorio, de, GitHub);
PowerShell;
git;
branch - M;
main;
git;
remote;
add;
origin;
https: //github.com/TU_USUARIO/TU_REPOSITORIO.git
 git;
push - u;
origin;
main;
Comparar;
con;
GPT - 5.5;
create;
mode;
100644;
dist / agent / sendaAgent.d.ts.map;
create;
mode;
100644;
dist / agent / sendaAgent.js;
create;
mode;
100644;
dist / agent / sendaAgent.js.map;
create;
mode;
100644;
dist / bienvenida.d.ts;
create;
mode;
100644;
dist / bienvenida.d.ts.map;
create;
mode;
100644;
dist / bienvenida.js;
create;
mode;
100644;
dist / bienvenida.js.map;
create;
mode;
100644;
dist / certificateService.d.ts;
create;
mode;
100644;
dist / certificateService.d.ts.map;
create;
mode;
100644;
dist / certificateService.js;
create;
mode;
100644;
dist / certificateService.js.map;
create;
mode;
100644;
dist / clientes.d.ts;
create;
mode;
100644;
dist / clientes.d.ts.map;
create;
mode;
100644;
dist / clientes.js;
create;
mode;
100644;
dist / clientes.js.map;
create;
mode;
100644;
dist / config / supabase.d.ts;
create;
mode;
100644;
dist / config / supabase.d.ts.map;
create;
mode;
100644;
dist / config / supabase.js;
create;
mode;
100644;
dist / config / supabase.js.map;
create;
mode;
100644;
dist / config / test - supabase.d.ts;
create;
mode;
100644;
dist / config / test - supabase.d.ts.map;
create;
mode;
100644;
dist / config / test - supabase.js;
create;
mode;
100644;
dist / config / test - supabase.js.map;
create;
mode;
100644;
dist / database.d.ts;
create;
mode;
100644;
dist / database.d.ts.map;
create;
mode;
100644;
dist / database.js;
create;
mode;
100644;
dist / database.js.map;
create;
mode;
100644;
dist / index.d.ts;
create;
mode;
100644;
dist / index.d.ts.map;
create;
mode;
100644;
dist / index.js;
create;
mode;
100644;
dist / index.js.map;
create;
mode;
100644;
dist / prueba.d.ts;
create;
mode;
100644;
dist / prueba.d.ts.map;
create;
mode;
100644;
dist / prueba.js;
create;
mode;
100644;
dist / prueba.js.map;
create;
mode;
100644;
dist / routes / commerce.routes.d.ts;
create;
mode;
100644;
dist / routes / commerce.routes.d.ts.map;
create;
mode;
100644;
dist / routes / commerce.routes.js;
create;
mode;
100644;
dist / routes / commerce.routes.js.map;
create;
mode;
100644;
dist / routes / factura.routes.d.ts;
create;
mode;
100644;
dist / routes / factura.routes.d.ts.map;
create;
mode;
100644;
dist / routes / factura.routes.js;
create;
mode;
100644;
dist / routes / factura.routes.js.map;
create;
mode;
100644;
dist / routes / invoice.routes.d.ts;
create;
mode;
100644;
dist / routes / invoice.routes.d.ts.map;
create;
mode;
100644;
dist / routes / invoice.routes.js;
create;
mode;
100644;
dist / routes / invoice.routes.js.map;
create;
mode;
100644;
dist / routes / payment.routes.d.ts;
create;
mode;
100644;
dist / routes / payment.routes.d.ts.map;
create;
mode;
100644;
dist / routes / payment.routes.js;
create;
mode;
100644;
dist / routes / payment.routes.js.map;
create;
mode;
100644;
dist / routes / webhook.routes.d.ts;
create;
mode;
100644;
dist / routes / webhook.routes.d.ts.map;
create;
mode;
100644;
dist / routes / webhook.routes.js;
create;
mode;
100644;
dist / routes / webhook.routes.js.map;
create;
mode;
100644;
dist / services / atcBot.d.ts;
create;
mode;
100644;
dist / services / atcBot.d.ts.map;
create;
mode;
100644;
dist / services / atcBot.js;
create;
mode;
100644;
dist / services / atcBot.js.map;
create;
mode;
100644;
dist / services / customer.service.d.ts;
create;
mode;
100644;
dist / services / customer.service.d.ts.map;
create;
mode;
100644;
dist / services / customer.service.js;
create;
mode;
100644;
dist / services / customer.service.js.map;
create;
mode;
100644;
dist / services / geminiVertex.d.ts;
create;
mode;
100644;
dist / services / geminiVertex.d.ts.map;
create;
mode;
100644;
dist / services / geminiVertex.js;
create;
mode;
100644;
dist / services / geminiVertex.js.map;
create;
mode;
100644;
dist / services / invoice.service.d.ts;
create;
mode;
100644;
dist / services / invoice.service.d.ts.map;
create;
mode;
100644;
dist / services / invoice.service.js;
create;
mode;
100644;
dist / services / invoice.service.js.map;
create;
mode;
100644;
dist / services / pairingService.d.ts;
create;
mode;
100644;
dist / services / pairingService.d.ts.map;
create;
mode;
100644;
dist / services / pairingService.js;
create;
mode;
100644;
dist / services / pairingService.js.map;
create;
mode;
100644;
dist / services / payment.service.d.ts;
create;
mode;
100644;
dist / services / payment.service.d.ts.map;
create;
mode;
100644;
dist / services / payment.service.js;
create;
mode;
100644;
dist / services / payment.service.js.map;
create;
mode;
100644;
dist / services / whatsapp.service.d.ts;
create;
mode;
100644;
dist / services / whatsapp.service.d.ts.map;
create;
mode;
100644;
dist / services / whatsapp.service.js;
create;
mode;
100644;
dist / services / whatsapp.service.js.map;
create;
mode;
100644;
dist / src / services / facturapi.service.d.ts;
create;
mode;
100644;
dist / src / services / facturapi.service.d.ts.map;
create;
mode;
100644;
dist / src / services / facturapi.service.js;
create;
mode;
100644;
dist / src / services / facturapi.service.js.map;
create;
mode;
100644;
dist / test - agent.d.ts;
create;
mode;
100644;
dist / test - agent.d.ts.map;
create;
mode;
100644;
dist / test - agent.js;
create;
mode;
100644;
dist / test - agent.js.map;
create;
mode;
100644;
dist / test - ai.d.ts;
create;
mode;
100644;
dist / test - ai.d.ts.map;
create;
mode;
100644;
dist / test - ai.js;
create;
mode;
100644;
dist / test - ai.js.map;
create;
mode;
100644;
dist / test - facturapi.d.ts;
create;
mode;
100644;
dist / test - facturapi.d.ts.map;
create;
mode;
100644;
dist / test - facturapi.js;
create;
mode;
100644;
dist / test - facturapi.js.map;
create;
mode;
100644;
dist / validador.d.ts;
create;
mode;
100644;
dist / validador.d.ts.map;
create;
mode;
100644;
dist / validador.js;
create;
mode;
100644;
dist / validador.js.map;
create;
mode;
100644;
src / services / facturapi.service.js;
create;
mode;
100644;
test - final.cjs;
create;
mode;
100644;
test - number.cjs;
delete mode;
100644;
whatsapp - bot - final.js;
create;
mode;
100644;
whatsa;
Veo;
que;
el;
listado;
de;
archivos;
muestra;
la;
compilación;
y;
los;
cambios;
listos;
en;
Git.
;
Para;
terminar;
de;
subir;
todo;
de;
golpe;
a;
tu;
repositorio;
remoto, simplemente;
ejecuta;
estos;
dos;
comandos;
finales;
en;
tu;
terminal: PowerShell;
git;
add.
;
git;
commit - m;
"Estructura completa de Senda y bot de WhatsApp optimizados";
git;
push;
origin;
main;
Excelente;
trabajo;
dejando;
operativo;
el;
sistema;
de;
comercio;
y;
atención;
al;
cliente;
Comparar;
con;
GPT - 5.5;
create;
mode;
100644;
dist / test - facturapi.d.ts;
create;
mode;
100644;
dist / test - facturapi.d.ts.map;
create;
mode;
100644;
dist / test - facturapi.js;
create;
mode;
100644;
dist / test - facturapi.js.map;
create;
mode;
100644;
dist / validador.d.ts;
create;
mode;
100644;
dist / validador.d.ts.map;
create;
mode;
100644;
dist / validador.js;
create;
mode;
100644;
dist / validador.js.map;
create;
mode;
100644;
src / services / facturapi.service.js;
create;
mode;
100644;
test - final.cjs;
create;
mode;
100644;
test - number.cjs;
delete mode;
100644;
whatsapp - bot - final.js;
create;
mode;
100644;
whatsapp_qr.txt;
PS;
C: ;
Users;
juanc;
Senda > git;
add.
    >> git;
commit - m;
"Estructura completa de Senda y bot de WhatsApp optimizados"
    >> git;
push;
origin;
main;
On;
branch;
main;
Your;
branch;
is;
ahead;
of;
'origin/main';
by;
1;
commit.
(use, "git push", to, publish, your, local, commits);
nothing;
to;
commit, working;
tree;
clean;
Enumerating;
objects: 947, done.
;
Counting;
objects: 100 % (947 / 947), done.
;
Delta;
compression;
import { Router } from 'express';
import { uploadCertificate } from '../certificateService';
// Importa tu cliente o SDK de Mercado Pago según lo tengas configurado en tu proyecto
import { MercadoPagoConfig, Preference } from 'mercadopago';
export { _default as default };
var up, to, fileToBase64, fileToBase64, 'C:\Users\juanc\Senda\server.js', router, _default, router, client;
const env_1 = { stack: [], error: void 0, hasError: false };
try {
    up = __addDisposableResource(env_1, void 0, false), to = __addDisposableResource(env_1, void 0, false);
    8;
    threads;
    Compressing;
    objects: 100 % (932 / 932), done.
    ;
    Writing;
    objects: 100 % (940 / 940), 189.84;
    KiB | 461.00;
    KiB / s, done.
        Total;
    940(delta, 19), reused;
    0(delta, 0), pack - reused;
    0(from, 0);
    remote: Resolving;
    deltas: 100 % (19 / 19), completed;
    with (6)
        local;
    objects.
    ;
    To;
    https: //github.com/juanelectronico/senda.git
     e28dd45..b34a35b;
    main -  > main;
    PS;
    C: ;
    Users;
    juanc;
    Senda > git;
    commit - m;
    "Estructura completa de Senda y bot de WhatsApp optimizados";
    On;
    branch;
    main;
    Your;
    branch;
    is;
    up;
    to;
    date;
    with ('origin/main'.
    )
        nothing;
    to;
    commit, working;
    tree;
    clean;
    PS;
    C: ;
    Users;
    juanc;
    Senda > git;
    push;
    origin;
    main;
    Everything;
    up - to - date;
    PS;
    C: ;
    Users;
    juanc;
    Senda >
    ;
    Listo;
    El;
    código;
    se;
    ha;
    subido;
    correctamente;
    a;
    tu;
    repositorio;
    en;
    GitHub;
    y;
    todo;
    está;
    actualizado;
    al;
    día.
    ;
    Cualquier;
    cosa;
    que;
    necesites;
    modificar;
    o;
    agregar;
    al;
    proyecto;
    de;
    Senda, aquí;
    estoy.
    ;
    Comparar;
    con;
    GPT - 5.5;
    gracias;
    te;
    veo;
    en;
    la;
    noche +
    ;
    De;
    nada;
    Aquí;
    estaré.Que;
    tengas;
    una;
    excelente;
    tarde;
    y;
    mucho;
    éxito;
    con;
    los;
    avances;
    de;
    Senda.Nos;
    vemos;
    en;
    la;
    noche.
    ;
    Comparar;
    con;
    GPT - 5.5;
    seguimos ?
        :
    ;
    Claro;
    que;
    sí;
    Qué;
    parte;
    de;
    Senda;
    o;
    del;
    bot;
    de;
    WhatsApp;
    vamos;
    a;
    revisar;
    ahora ?
        Comparar : ;
    con;
    GPT - 5.5;
    en;
    que;
    no;
    quedmos;
    la;
    ultima;
    vez ?
        La : ;
    última;
    vez;
    dejamos;
    el;
    proyecto;
    Senda;
    completamente;
    funcional;
    y;
    actualizado: Bot;
    de;
    WhatsApp: Solucionamos;
    el;
    problema;
    de;
    los;
    identificadores;
    internos(LID);
    de;
    WhatsApp;
    para;
    que;
    el;
    bot;
    reconozca;
    los;
    chats, procese;
    los;
    mensajes;
    correctamente;
    mediante;
    Gemini;
    y;
    envíe;
    las;
    respuestas;
    sin;
    errores.
    ;
    Control;
    de;
    Versiones: Subimos;
    y;
    sincronizamos;
    toda;
    la;
    estructura;
    limpia;
    del;
    proyecto;
    y;
    los;
    últimos;
    scripts;
    de;
    prueba;
    directamente;
    al;
    repositorio;
    en;
    GitHub(juanelectronico / senda).
    ;
    Qué;
    te;
    gustaría;
    ajustar, agregar;
    o;
    revisar;
    ahora ?
        Comparar : ;
    con;
    GPT - 5.5;
    necesito;
    correr;
    senda;
    en;
    la;
    cloud;
    Para;
    desplegar;
    Senda;
    en;
    la;
    nube(Cloud);
    y;
    mantener;
    el;
    bot;
    de;
    WhatsApp;
    y;
    la;
    API;
    corriendo;
    24 / 7, la;
    mejor;
    opción;
    es;
    utilizar;
    un;
    VPS(Virtual, Private, Server);
    como;
    Railway, Render, o;
    un;
    servidor;
    económico;
    en;
    DigitalOcean / AWS / Hostinger.
    ;
    Dado;
    que;
    utilizas;
    Baileys(que, requiere, mantener, una, sesión, persistente, en, disco, en, la, carpeta, sessions), las;
    plataformas;
    sin;
    servidor;
    tradicionales(Serverless, como, Vercel, o, AWS, Lambda);
    no;
    funcionan;
    bien;
    porque;
    borrarán;
    la;
    sesión;
    de;
    WhatsApp;
    cada;
    vez;
    que;
    se;
    reinicien.
    ;
    Aquí;
    tienes;
    la;
    guía;
    paso;
    a;
    paso;
    para;
    desplegarlo;
    en;
    un;
    VPS;
    con;
    Docker;
    o;
    directamente;
    con;
    PM2, que;
    es;
    la;
    forma;
    más;
    robusta;
    y;
    sin;
    restricciones;
    para;
    bots;
    de;
    WhatsApp: Opción;
    Recomendada: Desplegar;
    en;
    un;
    VPS(DigitalOcean, Hostinger, AWS, etc.);
    con;
    PM2;
    Esta;
    es;
    la;
    ruta;
    más;
    directa;
    porque;
    tu;
    código;
    actual;
    ya;
    maneja;
    Express;
    y;
    el;
    bot;
    de;
    WhatsApp;
    en;
    paralelo.
    ;
    1.;
    Prepara;
    tu;
    servidor(Ubuntu / Linux);
    Conéctate;
    a;
    tu;
    servidor;
    por;
    SSH;
    e;
    instala;
    Node.js(versión, 18, o, superior);
    y;
    Git: Bash;
    curl - fsSL;
    https: //deb.nodesource.com/setup_18.x | sudo -E bash -
     sudo;
    apt - get;
    install - y;
    nodejs;
    git;
    2.;
    Clona;
    tu;
    repositorio;
    Bash;
    git;
    clone;
    https: //github.com/juanelectronico/senda.git
     cd;
    senda;
    3.;
    Instala;
    las;
    dependencias;
    Bash;
    npm;
    install;
    4.;
    Configura;
    tus;
    variables;
    de;
    entorno;
    Crea;
    y;
    edita;
    el;
    archivo.env;
    en;
    la;
    raíz;
    del;
    proyecto;
    con;
    tus;
    claves;
    reales: Bash;
    nano.env;
    Pega;
    tus;
    credenciales(Supabase, Gemini, Puerto, etc.);
    Fragmento;
    de;
    código;
    PORT = 3001;
    SUPABASE_URL = tu_url_de_supabase;
    SUPABASE_KEY = tu_key_de_supabase;
    GEMINI_API_KEY = tu_key_de_gemini(Guarda, el, archivo, presionando, Ctrl + O, Enter, y, sal, con, Ctrl + X);
    5.;
    Instala;
    PM2;
    para;
    mantener;
    la;
    app;
    corriendo;
    24 / 7;
    PM2;
    se;
    encarga;
    de;
    revivir;
    tu;
    aplicación;
    si;
    el;
    servidor;
    se;
    reinicia;
    o;
    si;
    ocurre;
    un;
    fallo: Bash;
    sudo;
    npm;
    install - g;
    pm2;
    6.;
    Inicia;
    el;
    proyecto;
    con;
    PM2;
    Inicia;
    tu;
    script;
    principal(por, ejemplo, el, punto, de, entrada, de, tu, API, o, el, bot);
    Bash;
    pm2;
    start;
    dist / index.js--;
    name;
    "senda-backend";
    #;
    O;
    si;
    prefieres;
    correr;
    directamente;
    tu;
    archivo;
    de;
    bot: #;
    pm2;
    start;
    whatsapp - bot - final.cjs--;
    name;
    "senda-bot";
    pm2;
    save;
    pm2;
    startup;
    Cómo;
    escaneas;
    el;
    QR;
    si;
    está;
    en;
    la;
    nube ?
        Como : ;
    tu;
    bot;
    está;
    en;
    un;
    servidor;
    remoto, no;
    podrás;
    escanear;
    el;
    QR;
    directamente;
    en;
    la;
    terminal;
    del;
    servidor.Para;
    solucionar;
    esto, tu;
    código;
    ya;
    incluye;
    una;
    ruta;
    Express;
    que;
    genera;
    el;
    QR;
    como;
    imagen: Visita;
    en;
    tu;
    navegador: http: //IP_DE_TU_SERVIDOR:3001/qr
     Te;
    aparecerá;
    la;
    imagen;
    del;
    código;
    QR;
    directamente;
    en;
    la;
    web;
    para;
    que;
    la;
    escanees;
    con;
    el;
    WhatsApp;
    del;
    comercio.
    ;
    También;
    puedes;
    revisar;
    el;
    estado;
    actual;
    en: http: ; //IP_DE_TU_SERVIDOR:3001/status
    Prefieres;
    usar;
    esta;
    alternativa;
    de;
    VPS;
    o;
    tenías;
    en;
    mente;
    alguna;
    plataforma;
    en;
    la;
    nube;
    específica(como, Railway, o, Render) ?
        Comparar : ;
    con;
    GPT - 5.5;
    recuerda;
    que;
    estamos;
    corriendo;
    en;
    google;
    cloud;
    Ah, ;
    excelente;
    apunte;
    Si;
    estamos;
    corriendo;
    en;
    Google;
    Cloud, tenemos;
    un;
    abanico;
    de;
    servicios;
    ideales;
    dependiendo;
    de;
    cómo;
    quieras;
    estructurarlo.
    ;
    Dado;
    que;
    Senda;
    maneja;
    un;
    bot;
    de;
    WhatsApp;
    con;
    Baileys(que, necesita, persistencia, en, la, carpeta, sessions, para, no, perder, la, conexión, de, WhatsApp);
    y;
    una;
    API;
    de;
    Express, la;
    mejor;
    opción;
    en;
    el;
    ecosistema;
    de;
    Google;
    Cloud;
    es;
    Google;
    Compute;
    Engine(GCE);
    con;
    una;
    instancia;
    de;
    máquina;
    virtual(VM).
    ;
    Despliegue;
    en;
    Google;
    Cloud(Compute, Engine - VPS);
    Esta;
    es;
    la;
    ruta;
    más;
    limpia, barata(entra, en, el, tier, gratuito, o, una, instancia, e2 - micro, muy, económica);
    y;
    100 % compatible;
    con;
    sesiones;
    de;
    WhatsApp;
    y;
    bases;
    de;
    datos;
    locales;
    o;
    remotas(Supabase).
    ;
    1.;
    Crear;
    la;
    Instancia;
    en;
    Compute;
    Engine;
    Ve;
    a;
    la;
    consola;
    de;
    Google;
    Cloud;
    y;
    entra;
    a;
    Compute;
    Engine > Instancias;
    de;
    VM.
    ;
    Haz;
    clic;
    en;
    Crear;
    instancia.
    ;
    Configura;
    los;
    parámetros;
    básicos: Nombre: senda - cloud - bot;
    Región / Zona;
    Elige;
    la;
    más;
    cercana;
    a;
    tus;
    usuarios(ej.us - central1, o, us - east1).
        Serie / Tipo;
    de;
    máquina: E2 -  > e2 - micro(ideal, para, pruebas, y, producción, ligera);
    o;
    e2 - small.
    ;
    Sistema;
    operativo: Ubuntu(ej.Ubuntu, 22.04, LTS).
        Cortafuegos;
    Marca;
    la;
    casilla;
    Permitir;
    tráfico;
    HTTP;
    y;
    Permitir;
    tráfico;
    HTTPS(necesitaremos, abrir, el, puerto, del, bot, por, ejemplo, el, 3001).
    ;
    2.;
    Configurar;
    las;
    Reglas;
    de;
    Firewall;
    para;
    el;
    Puerto;
    del;
    Bot;
    Para;
    poder;
    ver;
    el;
    código;
    QR;
    desde;
    tu;
    navegador: En;
    Google;
    Cloud, ve;
    a;
    Red;
    de;
    VPC > Cortafuegos.
    ;
    Crea;
    una;
    regla;
    de;
    fuego(Crear, regla, de, firewall);
    Destinos: Etiquetas;
    de;
    destino;
    especificada(senda - port).
    ;
    Intervalos;
    de;
    IP;
    de;
    origen: 0.0;
    .0;
    .0 / 0;
    Protocolos;
    y;
    puertos: Selecciona;
    TCP;
    y;
    escribe;
    3001.;
    Aplica;
    la;
    etiqueta;
    senda - port;
    a;
    tu;
    instancia;
    de;
    máquina;
    virtual.
    ;
    3.;
    Conectarte;
    y;
    Configurar;
    el;
    Proyecto;
    Haz;
    clic;
    en;
    el;
    botón;
    SSH;
    al;
    lado;
    de;
    tu;
    instancia;
    en;
    la;
    consola;
    de;
    Google;
    Cloud;
    para;
    abrir;
    la;
    terminal;
    directamente;
    en;
    el;
    navegador: Bash;
    #;
    Instalar;
    Node.js;
    y;
    Git;
    curl - fsSL;
    https: //deb.nodesource.com/setup_18.x | sudo -E bash -
     sudo;
    apt - get;
    install - y;
    nodejs;
    git;
    #;
    Clonar;
    tu;
    repositorio;
    de;
    Senda;
    git;
    clone;
    https: //github.com/juanelectronico/senda.git
     cd;
    senda;
    #;
    Instalar;
    dependencias;
    npm;
    install;
    #;
    Crear;
    tu;
    archivo.env;
    con;
    las;
    credenciales;
    nano.env;
    Pega;
    tus;
    variables(SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY, PORT = 3001);
    y;
    guarda;
    el;
    archivo.
    ;
    4.;
    Mantenerlo;
    corriendo;
    24 / 7;
    con;
    PM2;
    Instala;
    PM2;
    para;
    asegurar;
    que;
    el;
    bot;
    no;
    se;
    caiga;
    y;
    se;
    reinicie;
    solo;
    si;
    la;
    máquina;
    se;
    apaga: Bash;
    sudo;
    npm;
    install - g;
    pm2;
    pm2;
    start;
    whatsapp - bot - final.cjs--;
    name;
    "senda-whatsapp";
    pm2;
    save;
    pm2;
    startup;
    5.;
    Obtener;
    el;
    QR;
    en;
    la;
    Nube;
    Como;
    la;
    terminal;
    de;
    Google;
    Cloud;
    es;
    de;
    texto;
    y;
    no;
    puedes;
    escanear;
    un;
    QR;
    físico;
    ahí, recuerda;
    que;
    tu;
    app;
    tiene;
    la;
    ruta;
    web;
    integrada: Abre;
    en;
    tu;
    navegador: http: //<IP_EXTERNA_DE_TU_INSTANCIA_GCP>:3001/qr
     Te;
    mostrará;
    la;
    imagen;
    del;
    código;
    QR;
    en;
    vivo;
    para;
    que;
    la;
    escanees;
    con;
    el;
    teléfono;
    del;
    comercio.
    ;
    Prefieres;
    que;
    afinemos;
    este;
    despliegue;
    en;
    Compute;
    Engine;
    o;
    tenías;
    pensado;
    usar;
    otro;
    servicio;
    específico;
    de;
    Google;
    Cloud(como, Cloud, Run, o, Google, Kubernetes, Engine) ?
        Comparar : ;
    con;
    GPT - 5.5;
    estoy;
    aquique;
    hago ?
        :
    ;
    Ah, excelente;
    Veo;
    que;
    ya;
    lo;
    tienes;
    desplegado;
    en;
    Google;
    Cloud;
    Run(en, el, servicio, llamado, senda, región, europe - west1).
    ;
    Como;
    estás;
    en;
    Cloud;
    Run, debes;
    tener;
    en;
    cuenta;
    una;
    limitación;
    técnica;
    muy;
    importante;
    para;
    los;
    bots;
    de;
    WhatsApp;
    hechos;
    con;
    Baileys: Cloud;
    Run;
    es;
    un;
    entorno;
    Serverless(sin, servidor);
    basado;
    en;
    contenedores;
    efímeros.Esto;
    significa;
    que;
    cuando;
    el;
    servicio;
    no;
    recibe;
    tráfico, se;
    apaga(escala, a, 0), y;
    cuando;
    se;
    enciende;
    de;
    nuevo, borra;
    la;
    carpeta;
    de;
    sesiones(sessions), lo;
    que;
    desconectará;
    tu;
    WhatsApp;
    y;
    te;
    pedirá;
    escanear;
    el;
    QR;
    otra;
    vez.
    ;
    Para;
    evitar;
    que;
    tu;
    bot;
    se;
    desconecte;
    constantemente, haz;
    lo;
    siguiente: Configura;
    el;
    escalamiento;
    mínimo: Haz;
    clic;
    en;
    el;
    icono;
    del;
    lápiz;
    que;
    está;
    al;
    lado;
    de;
    Escalamiento: automático(mín., 0, máx., 20), arriba;
    a;
    la;
    derecha;
    en;
    tu;
    pantalla.
    ;
    Cambia;
    el;
    Número;
    mínimo;
    de;
    instancias;
    de;
    0;
    a;
    1.;
    Guarda;
    los;
    cambios.Esto;
    mantendrá;
    al;
    menos;
    un;
    contenedor;
    vivo;
    24 / 7;
    para;
    que;
    no;
    pierda;
    la;
    sesión;
    de;
    WhatsApp.(Nota, Google, Cloud, ofrece, un, pequeño, margen, gratuito, pero, una, instancia, e2 - micro, o, mínima, corriendo, todo, el, mes, puede, tener, un, costo, menor).
    ;
    Verifica;
    la;
    URL;
    de;
    tu;
    servicio: Tu;
    enlace;
    público;
    actual;
    es: [https, //senda-575148645093.europe-west1.run.app](https://senda-575148645093.europe-west1.run.app)
        Si, quieres, ver, el, código, QR, para, conectar, el, WhatsApp, de, tu, comercio, entra, en, tu, navegador, a,
        [https,
            Quieres, que, revisemos, los, registros(Logs), en, la, pestaña, de, la, izquierda, para, verificar, si, el, bot, ya, inició, correctamente, en, Cloud, Run ?
                Comparar : , con, GPT - 5.5,
            lo, dejo, en, eslaamiento, automatico ? donde : , veo, los, logs ?
                Para : , ver, los, registros, y, saber, exactamente, qué, está, haciendo, tu, bot, en, Cloud, Run, haz, lo, siguiente,
            Dónde, ver, los, logs,
            En, la, misma, pantalla, que, tienes, abierta, en, el, menú, de, la, izquierda(bajo, la, sección, Observabilidad), haz, clic, en, Registros.
            ,
            Ahí, verás, en, tiempo, real, la, consola, de, tu, aplicación, lo, que, te, permitirá, confirmar, si, el, bot, conectó, con, éxito, a, WhatsApp, o, si, hay, algún, error, con, las, variables, de, entorno.
            ,
            Sobre, el, escalamiento, automático,
            Lo, ideal, para, un, bot, de, WhatsApp, basado, en, Baileys, es, no, dejarlo, en, mínimo, 0, ya, que, si, Cloud, Run, apaga, la, instancia, por, falta, de, tráfico, perderás, la, sesión, de, WhatsApp, y, tendrás, que, volver, a, escanear, el, código, QR.
            ,
            Te, sugiero, cambiar, el, Mínimo, de, instancias, a, 1, para, que, el, servicio, permanezca, activo, de, forma, continua, y, mantenga, la, conexión, de, WhatsApp, estable, 24 / 7.,
            Comparar, con, GPT - 5.5,
            En, esa, pantalla, estás, viendo, el, Historial, de, compilaciones(Cloud, Build).Muestra, cómo, se, han, ido, construyendo, y, desplegando, automáticamente, tus, commits, de, GitHub(b34a35b, e28dd45, etc.), cada, vez, que, haces, un, git, push.Las, que, tienen, el, círculo, verde, salieron, exitosas, y, las, rojas, fallaron.
            ,
            Para, ver, los, registros, detallados(Logs), de, cómo, está, corriendo, tu, aplicación, en, este, preciso, momento,
            En, el, menú, de, la, izquierda(o, volviendo, a, la, sección, anterior, de, tu, consola), entra, a, Cloud, Run.
            ,
            Haz, clic, sobre, el, nombre, de, tu, servicio(senda).
            ,
            Una, vez, dentro, de, los, detalles, del, servicio, ve, a, la, pestaña, que, dice, Registros(está, justo, debajo, de, Observabilidad, en, el, menú, secundario, que, veíamos, en, la, imagen, anterior).
            ,
            Ahí, podrás, ver, la, consola, de, Node.js, en, tiempo, real, y, comprobar, si, el, bot, de, Senda, se, conectó, correctamente, a, WhatsApp.
            ,
            Comparar, con, GPT - 5.5,
            no, entiendo, aqui, a, donde, voy,
            Ahí, mero, estás, en, el, lugar, correcto.En, la, pequeña, barra, lateral, izquierda, que, aparece, justo, debajo, de, Observabilidad, haz, clic, en, la, opción, que, dice, Registros(está, abajo, de, Métricas).
            ,
            Al, hacer, clic, ahí, se, abrirá, la, consola, en, tiempo, real, donde, verás, los, mensajes, de, texto, y, errores, que, emite, tu, código, de, Node.js.
            ,
            Comparar, con, GPT - 5.5,
            Perfecto, Los, registros, muestran, que, Senda, API, ha, arrancado, correctamente, en, el, puerto, 8080(Senda, API, corriendo, en, puerto, 8080, y, Supabase, inicializado).
            ,
            Todo, está, funcionando, de, manera, óptima, en, Google, Cloud, Run., Quieres, probar, alguna, otra, función, o, verificar, el, flujo, de, los, mensajes ?
                Comparar : , con, GPT - 5.5,
            quiero, ver, el, link, de, registro, donde, se, da, de, alta, el, comercio, y, enviarlo, a, que, lo, pruebe, una, cliente, ahora, mismo,
            El, enlace, para, que, la, cliente, se, dé, de, alta, y, pruebe, el, registro, en, vivo, es, el, archivo, HTML, estático, configurado, en, tu, API,
            Enlace, de, Registro, [https, //senda-575148645093.europe-west1.run.app/register.html](https://senda-575148645093.europe-west1.run.app/register.html)
                Copia, ese, enlace, y, envíaselo, ahora, mismo, para, que, pueda, realizar, las, pruebas.
                ,
                Comparar, con, GPT - 5.5,
                Ah, lo, que, pasó, es, que, pegaste, el, enlace, dentro, del, buscador, de, Google(incluyendo, los, paréntesis), en, lugar, de, ponerlo, en, la, barra, de, direcciones, superior, del, navegador.Por, eso, Google, intentó, buscar, esas, palabras, como, si, fueran, texto.
                ,
                Copia, únicamente, este, enlace, exacto, y, pégalo, en, la, barra, superior, de, direcciones(donde, escribes, las, páginas, web),
                [https, //senda-575148645093.europe-west1.run.app/register.html](https://senda-575148645093.europe-west1.run.app/register.html)
                    Comparar, con, GPT - 5.5,
                    El, error, "Error: Servicio de pagos no disponible", indica, que, al, momento, de, procesar, el, registro, del, comercio, el, sistema, está, intentando, conectar, con, la, pasarela, de, pagos, o, el, servicio, externo(como, Stripe, o, Facturapi / pagos), y, no, recibe, respuesta, o, falta, configurar, alguna, variable, de, entorno, relacionada, en, Cloud, Run.
                    ,
                    Para, solucionarlo, de, inmediato,
                    Revisa, tus, variables, de, entorno, en, Google, Cloud, Run,
                    Ve, a, los, detalles, de, tu, servicio, senda, en, Google, Cloud, Run.
                    ,
                    Entra, a, la, pestaña, Editar, y, desplegar, nueva, revisión(o, la, sección, de, Variables, y, secretos).
                    ,
                    Asegúrate, de, haber, agregado, todas, las, llaves, de, API, necesarias(como, las, de, pagos, Stripe, o, las, credenciales, correspondientes), que, tu, código, usa, al, momento, de, registrar, un, comercio.
                    ,
                    Verifica, los, registros(Logs), al, momento, del, error,
                    Vuelve, a, intentar, hacer, el, registro, de, prueba, mientras, miras, la, pestaña, de, Registros, en, tiempo, real.
                    ,
                    Eso, te, mostrará, el, rastro, exacto, de, Node.js, diciendo, qué, variable, o, servicio, falló, en, la, línea, de, código, del, backend.
                    ,
                    Comparar, con, GPT - 5.5,
                    Para, agregar, o, verificar, la, variable, de, entorno, que, está, causando, ese, error, de, pago, haz, lo, siguiente,
                    En, esa, pantalla, de, Cloud, Run, haz, clic, sobre, el, nombre, de, tu, servicio(senda).
                    ,
                    Arriba, en, el, menú, de, opciones, busca, y, haz, clic, en, el, botón, Editar, y, desplegar, nueva, revisión(o, ve, a, la, pestaña, Revisiones, y, selecciona, Editar, la, configuración, actual).
                    ,
                    Baja, hasta, la, sección, de, Variables, y, secretos(o, variables, de, entorno).
                    ,
                    Asegúrate, de, que, las, credenciales, de, tu, servicio, de, pagos, o, Facturapi, estén, correctamente, añadidas, como, variable, de, entorno(por, ejemplo, FACTURAPI_KEY, o, la, clave, que, utilice, tu, código).
                    ,
                    Despliega, los, cambios, haciendo, clic, en, Implementar.
                    ,
                    Al, actualizar, la, revisión, con, la, variable, correcta, el, registro, del, comercio, funcionará, a, la, perfección.
                    ,
                    Comparar, con, GPT - 5.5,
                    no, veo, las, opciones, que, me, dices,
                    Es, completamente, normal, que, no, las, veas, ahí, porque, esa, pantalla, es, solo, el, panel, de, métricas, y, gráficos.
                    ,
                    Para, editar, las, variables, de, entorno, de, Cloud, Run, haz, lo, siguiente,
                    Fíjate, en, la, barra, superior, de, la, página, justo, arriba, donde, dice, Detalles, del, servicio.Verás, un, botón, azul, que, dice, Editar, la, configuración, del, repositorio(o, un, icono, con, un, lápiz).
                    ,
                    Haz, clic, ahí, para, abrir, la, configuración, completa, del, servicio.
                    ,
                    Dentro, de, esa, configuración, encontrarás, la, sección, para, administrar, las, variables, de, entorno, y, añadir, la, clave, que, falta.
                    ,
                    Comparar, con, GPT - 5.5,
                    Exacto, Ya, estás, en, la, pantalla, correcta(Implementar, la, revisión, de, senda).
                    ,
                    Haz, lo, siguiente,
                    Baja, un, poco, en, esta, misma, página(puedes, usar, la, barra, de, desplazamiento, de, la, derecha), hasta, encontrar, la, sección, de, Variables, y, secretos(o, Variables, de, entorno).
                    ,
                    Añade, o, verifica, la, clave, necesaria, para, el, servicio, de, pagos, que, está, faltando.
                    ,
                    Haz, clic, en, el, botón, azul, de, Implementar, que, está, abajo, a, la, izquierda, para, guardar, los, cambios, y, actualizar, el, servicio.
                    ,
                    Comparar, con, GPT - 5.5,
                    Excelente, Veo, que, la, nueva, revisión(senda - 31 - tbn), se, ha, implementado, y, actualizado, con, éxito, en, Cloud, Run.
                    ,
                    Vuelve, a, abrir, la, página, de, registro, de, tu, cliente, en, el, navegador([https, //senda-575148645093.europe-west1.run.app/register.html](https://senda-575148645093.europe-west1.run.app/register.html)), ingresa los datos de prueba y envíalo para verificar que el alta del comercio avance sin el error de pagos anterior.
                        Comparar, con, GPT - 5.5,
                        Vuelves, a, tener, el, aviso, "Error: Servicio de pagos no disponible".Esto, significa, que, el, código, del, backend(register.html, o, el, script, de, Node.js, que, procesa, el, formulario), sigue, intentando, comunicarse, con, la, pasarela, de, pagos, y, la, variable, o, la, ruta, del, servicio, de, pagos, no, está, respondiendo, correctamente, o, falta, definirla, en, el, entorno, de, Cloud, Run.
                        ,
                        Para, resolverlo, de, raíz,
                        Revisa, el, archivo, de, código, fuente, del, backend, Abre, tu, proyecto, localmente, en, VS, Code, y, busca, dónde, se, lanza, ese, mensaje, exacto("Servicio de pagos no disponible").
                        ,
                        Identifica, la, dependencia, Mira, si, está, llamando, a, una, API, externa, de, pagos, a, una, variable, de, entorno, que, no, se, configuró, en, Cloud, Run, o, si, hay, una, función, mock / simulada, que, está, devolviendo, ese, error, por, defecto.
                        ,
                        Agrega, la, variable, faltante, Una, vez, que, sepas, qué, clave, o, endpoint, requiere, el, servicio, de, pagos, agrégalo, en, las, variables, de, entorno, de, Cloud, Run, tal, como, lo, hiciste, antes, y, vuelve, a, desplegar.
                        ,
                        Comparar, con, GPT - 5.5,
                        no, entendi, nada, espera, paso, a, paso, en, consola, no, tengo, mensajes, de, esto,
                        Entendido, vámonos, paso, a, paso, y, con, calma.Tienes, toda, la, razón, si, en, la, consola, de, Google, Cloud, no, aparece, ningún, registro, de, ese, error, significa, que, el, error, se, está, generando, directamente, en, el, navegador, del, cliente, antes, de, que, la, petición, llegue, a, tocar, el, servidor.
                        ,
                        Hagamos, una, prueba, sencilla, para, descubrir, exactamente, qué, está, pasando,
                        Abre, las, herramientas, de, desarrollador, en, tu, navegador,
                        Estando, en, la, página, de, registro(/register.html), presiona, la, tecla, F12, en, tu, teclado(o, haz, clic, derecho, en, cualquier, parte, de, la, página, y, selecciona, Inspeccionar).
                        ,
                        Ve, a, la, pestaña, de, Red(Network),
                        En, la, ventanita, que, se, abrió(generalmente, abajo, o, a, la, derecha), busca, y, haz, clic, en, la, pestaña, que, dice, Network(o, Red).
                        ,
                        Vuelve, a, intentar, el, registro,
                        Llena, los, datos, de, prueba, y, haz, clic, en, el, botón, de, registrar.
                        ,
                        Revisa, qué, solicitud, falló, en, rojo,
                        Al, darle, clic, verás, que, aparecen, líneas, de, peticiones, en, esa, pestaña.Si, alguna, se, pone, en, rojo, haz, clic, en, ella, y, luego, ve, a, la, sub - pestaña, Response(o, Respuesta), para, ver, qué, mensaje, exacto, devolvió, el, navegador.
                        ,
                        Dime, qué, ves, ahí, o, hazle, otra, captura, a, esa, parte, de, la, consola, del, navegador, para, ver, qué, archivo, o, línea, de, JavaScript, está, lanzando, el, aviso, de, pago.
                        ,
                        Comparar, con, GPT - 5.5,
                        no, funciona, f12, ni, click, derecho,
                        Ah, con, razón.Es, muy, probable, que, el, código, de, la, página, o, algún, script, de, seguridad, tenga, bloqueado, el, clic, derecho, y, las, teclas, de, acceso, rápido.
                        ,
                        Hagamos, una, revisión, directa, en, tu, código, local(en, VS, Code, que, lo, tienes, abierto, abajo, en, la, barra, de, tareas),
                        Abre, VS, Code.
                        ,
                        Usa, el, buscador, de, archivos(o, presiona, Ctrl + P), y, busca, el, archivo, JavaScript, o, el, archivo, HTML, donde, se, maneja, el, formulario, de, registro(register.html, o, el, archivo.js, que, procesa, el, botón, de, envío).
                        ,
                        Busca, la, palabra, clave, "Servicio de pagos", o, "pagos", dentro, de, tu, código.
                        ,
                        Pásame, por, aquí, el, pedazo, de, código, donde, encuentres, ese, mensaje, o, esa, validación, y, así, descubrimos, exactamente, qué, condición, está, disparando, el, error.
                        ,
                        Comparar, con, GPT - 5.5,
                        te, coparto, el, codigo, de, register ?
                            :
                        ,
                        Sí, por, favor, Compárteme, el, código, de, register(o, la, parte, donde, se, procesa, el, formulario), para, que, lo, revisemos, juntos, y, veamos, exactamente, por, qué, salta, ese, aviso.
                        ,
                        Comparar, con, GPT - 5.5,
                        codigo, register.html, html >
                            lang, "es" >
                            charset, "UTF-8" >
                            name, "viewport", content = "width=device-width, initial-scale=1.0" >
                            Senda - Alta, de, Comercio < /title>
                            < script, src = "https://cdn.tailwindcss.com" > /script>
                            < /head>
                            < body, class {
                        } = "bg-slate-950 text-slate-100 min-h-screen flex flex-col items-center justify-center p-4" >
                            class {
                            }, "max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl my-8" >
                            class {
                            }, "text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-500 mb-2 text-center" >
                            Alta, de, Comercio
                            < /h1>
                            < p, class {
                        } = "text-slate-400 text-sm text-center mb-6" >
                            Registra, tu, negocio, con, tus, credenciales, del, SAT, y, vincula, tu, WhatsApp, para, automatizar, la, facturación, de, tus, clientes.
                            < /p>
                            < !--Formulario, -- >
                            id, "registerForm", class {
                        } = "space-y-4" >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > RFC * /label>
                            < input, type = "text", id = "rfc", required, class {
                        } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500", placeholder = "XEXX010101000" >
                            /div>
                            < div >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Razón, Social * /label>
                            < input, type = "text", id = "business_name", required, class {
                        } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500", placeholder = "Mi Comercio S.A. de C.V." >
                            /div>
                            < div, class {
                        } = "grid grid-cols-2 gap-4" >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Régimen, Fiscal * /label>
                            < select, id = "tax_regime", required, class {
                        } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500" >
                            value, "" > Selecciona, un, régimen, .../option>
                            < option, value = "601" > 601 - General, de, Ley, Personas, Morales < /option>
                            < option, value = "603" > 603 - Personas, Morales, con, Fines, no, Lucrativos < /option>
                            < option, value = "605" > 605 - Sueldos, y, Salarios, e, Ingresos, Asimilados, a, Salarios < /option>
                            < option, value = "606" > 606 - Arrendamiento < /option>
                            < option, value = "607" > 607 - Demás, ingresos < /option>
                            < option, value = "608" > 608 - Residentes, en, el, Extranjero, sin, Establecimiento, Permanente, en, México < /option>
                            < option, value = "610" > 610 - Ingresos, por, Dividendos(socios, y, accionistas) < /option>
                            < option, value = "611" > 611 - Ingresos, por, Salarios, y, en, General, por, la, Prestación, de, un, Servicio, Personal, Subordinado < /option>
                            < option, value = "612" > 612 - Personas, Físicas, con, Actividades, Empresariales, y, Profesionales < /option>
                            < option, value = "614" > 614 - Ingresos, por, intereses < /option>
                            < option, value = "615" > 615 - Régimen, de, los, ingresos, por, obtención, de, premios < /option>
                            < option, value = "616" > 616 - Sin, obligaciones, fiscales < /option>
                            < option, value = "620" > 620 - Sociedades, Cooperativas, de, Producción, que, optan, por, diferir, sus, ingresos < /option>
                            < option, value = "621" > 621 - Incorporación, Fiscal < /option>
                            < option, value = "622" > 622 - Actividades, Agrícolas, Ganaderas, Silvícolas, y, Pesqueras < /option>
                            < option, value = "623" > 623 - Opcional, para, Grupos, de, Sociedades < /option>
                            < option, value = "624" > 624 - Coordinados < /option>
                            < option, value = "625" > 625 - Régimen, de, las, Actividades, Empresariales, con, ingresos, a, través, de, Plataformas, Tecnológicas < /option>
                            < option, value = "626" > 626 - Régimen, Simplificado, de, Confianza(RESICO) < /option>
                            < /select>
                            < /div>
                            < div >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Código, Postal * /label>
                            < input, type = "text", id = "zip_code", required, class {
                        } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500", placeholder = "01000" >
                            /div>
                            < /div>
                            < div, class {
                        } = "grid grid-cols-2 gap-4" >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Teléfono(WhatsApp) * /label>
                            < input, type = "text", id = "phone", required, class {
                        } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500", placeholder = "5215512345678" >
                            /div>
                            < div >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Correo, Electrónico * /label>
                            < input, type = "email", id = "email", required, class {
                        } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500", placeholder = "correo@dominio.com" >
                            /div>
                            < /div>
                            < hr, class {
                        } = "border-slate-800 my-4" >
                            class {
                            }, "text-sm font-bold text-teal-400 uppercase tracking-wider" > Credenciales, CSD(SAT) * /h3>
                            < div, class {
                        } = "grid grid-cols-2 gap-4" >
                            class {
                            }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Certificado().cer]) * /label>
                        < input, type = "file", id = "cer_file", required, class {
                    } = "w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-teal-400 hover:file:bg-slate-700" >
                        /div>
                        < div >
                        class {
                        }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Llave, Privada().key,  * /label>
                        < input, type = "file", id = "key_file", required, class {
                    } = "w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-teal-400 hover:file:bg-slate-700" >
                        /div>
                        < /div>
                        < div >
                        class {
                        }, "block text-xs font-semibold text-slate-300 uppercase mb-1" > Contraseña, de, la, Clave, Privada * /label>
                        < input, type = "password", id = "csd_password", required, class {
                    } = "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500", placeholder = "••••••••" >
                        /div>
                        < button, type = "submit", id = "submitBtn", class {
                    } = "w-full mt-6 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-bold py-3 rounded-lg transition-all shadow-lg" >
                        Registrar, Comercio
                        < /button>
                        < /form>
                        < /div>
                        < !--VENTANA, EMERGENTE(MODAL, FLOTANTE)-- >
                        id, "paymentModal", class {
                    } = "hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" >
                        class {
                        }, "bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl space-y-4" >
                        class {
                        }, "w-16 h-16 bg-teal-500/10 text-teal-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold" >
                    ,
                    /div>
                        < h3, class {
                    } = "text-xl font-bold text-slate-100" > , Comercio, Registrado, con, Éxito < /h3>
                        < p, class {
                    } = "text-slate-400 text-sm" >
                        Tu, cuenta, está, lista.Solo, falta, completar, tu, aportación, de, activación, por < span, class {
                    } = "text-teal-400 font-bold" > $50, .00, MXN < /span> para habilitar las facturas automáticas en WhatsApp.
                        < /p>
                        < div, id = "modalAction", class {
                    } = "pt-4" >
                        --El, botón, de, pago, exclusivo, de, Mercado, Pago, se, inyectará, aquí-- >
                        /div>
                        < /div>
                        < (/div>)]]]];
    fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = (error) => reject(error);
        });
    };
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        const cerFileInput = document.getElementById('cer_file').files[0];
        const keyFileInput = document.getElementById('key_file').files[0];
        const passwordVal = document.getElementById('csd_password').value;
        // Validación estricta en el lado del cliente
        if (!cerFileInput || !keyFileInput || !passwordVal) {
            alert('⚠️ Los archivos .cer, .key y la contraseña del CSD son obligatorios para realizar el registro.');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Registrando comercio...';
        try {
            const csd_cer_base64 = await fileToBase64(cerFileInput);
            const csd_key_base64 = await fileToBase64(keyFileInput);
            const payload = {
                rfc: document.getElementById('rfc').value,
                business_name: document.getElementById('business_name').value,
                tax_regime: document.getElementById('tax_regime').value,
                zip_code: document.getElementById('zip_code').value,
                phone: document.getElementById('phone').value,
                email: document.getElementById('email').value,
                csd_cer_base64: csd_cer_base64,
                csd_key_base64: csd_key_base64,
                csd_password: passwordVal
            };
            const response = await fetch('/api/commerce/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
                const modalAction = document.getElementById('modalAction');
                if (result.init_point) {
                    modalAction.innerHTML = `

                            <a href="${result.init_point}" class="block w-full bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold py-3 rounded-lg transition-all shadow-lg text-center">

                                Pagar $50.00 MXN en Mercado Pago

                            </a>

                        `;
                }
                else {
                    modalAction.innerHTML = `<p class="text-amber-400 text-sm">No se pudo generar el link de pago automático, contacta soporte.</p>`;
                }
                document.getElementById('paymentModal').classList.remove('hidden');
            }
            else {
                alert('Error: ' + (result.error || 'No se pudo completar el registro'));
                btn.disabled = false;
                btn.textContent = 'Registrar Comercio';
            }
        }
        catch (err) {
            console.error(err);
            alert('Error procesando los archivos o conectando con el servidor.');
            btn.disabled = false;
            btn.textContent = 'Registrar Comercio';
        }
    });
    /script>
        < /body>
        < /html>;
    Gracias;
    por;
    compartir;
    el;
    código.Al;
    revisarlo, ya;
    podemos;
    ver;
    exactamente;
    qué;
    está;
    pasando: El;
    formulario;
    hace;
    una;
    petición;
    fetch;
    a;
    la;
    ruta / api / commerce / register.
    ;
    El;
    mensaje;
    que;
    ves;
    en;
    pantalla("Error: Servicio de pagos no disponible");
    viene;
    directamente;
    del;
    servidor;
    backend;
    cuando;
    esa;
    ruta;
    procesa;
    los;
    datos(probablemente, al, intentar, comunicarse, con, la, API, de, Mercado, Pago, para, generar, el, cobro, y, no, recibe, el, init_point, o, la, pasarela, de, pagos, falla).Como;
    el;
    servidor;
    responde;
    con;
    un;
    JSON;
    que;
    contiene;
    success: false;
    y;
    un;
    texto;
    de;
    error, el;
    frontend;
    muestra;
    ese;
    alert('Error: ' + result.error).
    ;
    Para;
    corregirlo, necesitamos;
    revisar;
    el;
    archivo;
    del;
    servidor;
    de;
    Node.js(por, ejemplo, server.js, o, el, archivo, que, maneja, las, rutas, de, la, API, en, tu, backend);
    en;
    la;
    sección;
    donde;
    está;
    definido;
    el;
    endpoint / api / commerce / register.
    ;
    Tienes;
    a;
    la;
    mano;
    el;
    archivo;
    del;
    servidor;
    de;
    Node.js;
    para;
    echarle;
    un;
    vistazo;
    y;
    ver;
    cómo;
    está;
    configurada;
    la;
    llamada;
    a;
    los;
    pagos ?
        Comparar : ;
    con;
    GPT - 5.5;
    te;
    comparto;
    el;
    register.html;
    html >
        lang;
    "es" >
        charset;
    "UTF-8" >
        name;
    "viewport";
    content = "width=device-width, initial-scale=1.0" >
        Senda - Alta;
    de;
    Comercio < /title>
        < script;
    src = "https://cdn.tailwindcss.com" > /script>
        < /head>
        < body;
    class {
    };
    "bg-slate-950 text-slate-100 min-h-screen flex flex-col items-center justify-center p-4" >
        class {
        };
    "max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl my-8" >
        class {
        };
    "text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-500 mb-2 text-center" >
        Alta;
    de;
    Comercio
        < /h1>
        < p;
    class {
    };
    "text-slate-400 text-sm text-center mb-6" >
        Registra;
    tu;
    negocio;
    con;
    tus;
    credenciales;
    del;
    SAT;
    y;
    vincula;
    tu;
    WhatsApp;
    para;
    automatizar;
    la;
    facturación;
    de;
    tus;
    clientes.
        < /p>
        < !--Formulario;
    -- >
        id;
    "registerForm";
    class {
    };
    "space-y-4" >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > RFC * /label>
        < input;
    type = "text";
    id = "rfc";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500";
    placeholder = "XEXX010101000" >
        /div>
        < div >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Razón;
    Social * /label>
        < input;
    type = "text";
    id = "business_name";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500";
    placeholder = "Mi Comercio S.A. de C.V." >
        /div>
        < div;
    class {
    };
    "grid grid-cols-2 gap-4" >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Régimen;
    Fiscal * /label>
        < select;
    id = "tax_regime";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500" >
        value;
    "" > Selecciona;
    un;
    régimen;
    /option>
        < option;
    value = "601" > 601 - General;
    de;
    Ley;
    Personas;
    Morales < /option>
        < option;
    value = "603" > 603 - Personas;
    Morales;
    con;
    Fines;
    no;
    Lucrativos < /option>
        < option;
    value = "605" > 605 - Sueldos;
    y;
    Salarios;
    e;
    Ingresos;
    Asimilados;
    a;
    Salarios < /option>
        < option;
    value = "606" > 606 - Arrendamiento < /option>
        < option;
    value = "607" > 607 - Demás;
    ingresos < /option>
        < option;
    value = "608" > 608 - Residentes;
    en;
    el;
    Extranjero;
    sin;
    Establecimiento;
    Permanente;
    en;
    México < /option>
        < option;
    value = "610" > 610 - Ingresos;
    por;
    Dividendos(socios, y, accionistas) < /option>
        < option;
    value = "611" > 611 - Ingresos;
    por;
    Salarios;
    y;
    en;
    General;
    por;
    la;
    Prestación;
    de;
    un;
    Servicio;
    Personal;
    Subordinado < /option>
        < option;
    value = "612" > 612 - Personas;
    Físicas;
    con;
    Actividades;
    Empresariales;
    y;
    Profesionales < /option>
        < option;
    value = "614" > 614 - Ingresos;
    por;
    intereses < /option>
        < option;
    value = "615" > 615 - Régimen;
    de;
    los;
    ingresos;
    por;
    obtención;
    de;
    premios < /option>
        < option;
    value = "616" > 616 - Sin;
    obligaciones;
    fiscales < /option>
        < option;
    value = "620" > 620 - Sociedades;
    Cooperativas;
    de;
    Producción;
    que;
    optan;
    por;
    diferir;
    sus;
    ingresos < /option>
        < option;
    value = "621" > 621 - Incorporación;
    Fiscal < /option>
        < option;
    value = "622" > 622 - Actividades;
    Agrícolas, Ganaderas, Silvícolas;
    y;
    Pesqueras < /option>
        < option;
    value = "623" > 623 - Opcional;
    para;
    Grupos;
    de;
    Sociedades < /option>
        < option;
    value = "624" > 624 - Coordinados < /option>
        < option;
    value = "625" > 625 - Régimen;
    de;
    las;
    Actividades;
    Empresariales;
    con;
    ingresos;
    a;
    través;
    de;
    Plataformas;
    Tecnológicas < /option>
        < option;
    value = "626" > 626 - Régimen;
    Simplificado;
    de;
    Confianza(RESICO) < /option>
        < /select>
        < /div>
        < div >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Código;
    Postal * /label>
        < input;
    type = "text";
    id = "zip_code";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500";
    placeholder = "01000" >
        /div>
        < /div>
        < div;
    class {
    };
    "grid grid-cols-2 gap-4" >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Teléfono(WhatsApp) * /label>
        < input;
    type = "text";
    id = "phone";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500";
    placeholder = "5215512345678" >
        /div>
        < div >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Correo;
    Electrónico * /label>
        < input;
    type = "email";
    id = "email";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500";
    placeholder = "correo@dominio.com" >
        /div>
        < /div>
        < hr;
    class {
    };
    "border-slate-800 my-4" >
        class {
        };
    "text-sm font-bold text-teal-400 uppercase tracking-wider" > Credenciales;
    CSD(SAT) * /h3>
        < div;
    class {
    };
    "grid grid-cols-2 gap-4" >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Certificado(cer) * /label>
        < input;
    type = "file";
    id = "cer_file";
    required;
    class {
    };
    "w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-teal-400 hover:file:bg-slate-700" >
        /div>
        < div >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Llave;
    Privada(key) * /label>
        < input;
    type = "file";
    id = "key_file";
    required;
    class {
    };
    "w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-teal-400 hover:file:bg-slate-700" >
        /div>
        < /div>
        < div >
        class {
        };
    "block text-xs font-semibold text-slate-300 uppercase mb-1" > Contraseña;
    de;
    la;
    Clave;
    Privada * /label>
        < input;
    type = "password";
    id = "csd_password";
    required;
    class {
    };
    "w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-teal-500";
    placeholder = "••••••••" >
        /div>
        < button;
    type = "submit";
    id = "submitBtn";
    class {
    };
    "w-full mt-6 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-bold py-3 rounded-lg transition-all shadow-lg" >
        Registrar;
    Comercio
        < /button>
        < /form>
        < /div>
        < !--VENTANA;
    EMERGENTE(MODAL, FLOTANTE)-- >
        id;
    "paymentModal";
    class {
    };
    "hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50" >
        class {
        };
    "bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl space-y-4" >
        class {
        };
    "w-16 h-16 bg-teal-500/10 text-teal-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold" >
    ;
    /div>
        < h3;
    class {
    };
    "text-xl font-bold text-slate-100" > ;
    Comercio;
    Registrado;
    con;
    Éxito < /h3>
        < p;
    class {
    };
    "text-slate-400 text-sm" >
        Tu;
    cuenta;
    está;
    lista.Solo;
    falta;
    completar;
    tu;
    aportación;
    de;
    activación;
    por < span;
    class {
    };
    "text-teal-400 font-bold" > $50;
    .00;
    MXN < /span> para habilitar las facturas automáticas en WhatsApp.
        < /p>
        < div;
    id = "modalAction";
    class {
    };
    "pt-4" >
        --El;
    botón;
    de;
    pago;
    exclusivo;
    de;
    Mercado;
    Pago;
    se;
    inyectará;
    aquí-- >
        /div>
        < /div>
        < (/div>);
    fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = (error) => reject(error);
        });
    };
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        const cerFileInput = document.getElementById('cer_file').files[0];
        const keyFileInput = document.getElementById('key_file').files[0];
        const passwordVal = document.getElementById('csd_password').value;
        // Validación estricta en el lado del cliente
        if (!cerFileInput || !keyFileInput || !passwordVal) {
            alert('⚠️ Los archivos .cer, .key y la contraseña del CSD son obligatorios para realizar el registro.');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Registrando comercio...';
        try {
            const csd_cer_base64 = await fileToBase64(cerFileInput);
            const csd_key_base64 = await fileToBase64(keyFileInput);
            const payload = {
                rfc: document.getElementById('rfc').value,
                business_name: document.getElementById('business_name').value,
                tax_regime: document.getElementById('tax_regime').value,
                zip_code: document.getElementById('zip_code').value,
                phone: document.getElementById('phone').value,
                email: document.getElementById('email').value,
                csd_cer_base64: csd_cer_base64,
                csd_key_base64: csd_key_base64,
                csd_password: passwordVal
            };
            const response = await fetch('/api/commerce/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
                const modalAction = document.getElementById('modalAction');
                if (result.init_point) {
                    modalAction.innerHTML = `

                            <a href="${result.init_point}" class="block w-full bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold py-3 rounded-lg transition-all shadow-lg text-center">

                                Pagar $50.00 MXN en Mercado Pago

                            </a>

                        `;
                }
                else {
                    modalAction.innerHTML = `<p class="text-amber-400 text-sm">No se pudo generar el link de pago automático, contacta soporte.</p>`;
                }
                document.getElementById('paymentModal').classList.remove('hidden');
            }
            else {
                alert('Error: ' + (result.error || 'No se pudo completar el registro'));
                btn.disabled = false;
                btn.textContent = 'Registrar Comercio';
            }
        }
        catch (err) {
            console.error(err);
            alert('Error procesando los archivos o conectando con el servidor.');
            btn.disabled = false;
            btn.textContent = 'Registrar Comercio';
        }
    });
    /script>
        < /body>
        < /html>;
    Para;
    solucionar;
    el;
    problema, necesitamos;
    ver;
    el;
    archivo;
    del;
    servidor;
    de;
    Node.js(por, ejemplo, server.js, o, el, archivo, de, rutas, del, backend);
    donde;
    se;
    encuentra;
    configurado;
    el;
    endpoint / api / commerce / register.
    ;
    Por;
    favor, compárteme;
    el;
    fragmento;
    de;
    código;
    de;
    tu;
    backend;
    que;
    procesa;
    esa;
    ruta;
    para;
    revisar;
    qué;
    variable;
    o;
    conexión;
    con;
    la;
    pasarela;
    de;
    pagos;
    está;
    fallando;
    y;
    arreglarlo;
    de;
    inmediato.
    ;
    Comparar;
    con;
    GPT - 5.5;
    ayudame;
    a;
    ubicar;
    donde;
    esta;
    lo;
    que;
    bsucamos;
    desde;
    la;
    consola;
    Para;
    revisar;
    los;
    registros;
    exactos;
    del;
    backend;
    y;
    ver;
    el;
    error;
    detallado;
    del;
    servidor(ya, que, el, formulario, se, comunica, con / api / commerce / register), vamos;
    a;
    buscarlo;
    directamente;
    en;
    la;
    consola;
    de;
    Google;
    Cloud;
    paso;
    a;
    paso: Ve;
    al;
    panel;
    principal;
    de;
    Cloud;
    Run;
    y;
    haz;
    clic;
    sobre;
    el;
    nombre;
    de;
    tu;
    servicio(senda).
    ;
    En;
    la;
    parte;
    superior;
    de;
    la;
    página;
    de;
    detalles;
    del;
    servicio, verás;
    varias;
    pestañas;
    horizontales(Observabilidad, Revisiones, Fuente, Activadores, Redes, Seguridad, YAML).Haz;
    clic;
    en;
    Observabilidad.
    ;
    Justo;
    debajo;
    de;
    esas;
    pestañas, verás;
    un;
    menú;
    lateral;
    interno;
    o;
    subsecciones(Métricas, Registros, SLO, Errores, Costo).Haz;
    clic;
    en;
    Registros.
    ;
    En;
    la;
    barra;
    de;
    búsqueda;
    de;
    registros;
    que;
    aparece;
    arriba("Filtro: Buscar en todos los campos y valores"), borra;
    cualquier;
    filtro;
    que;
    esté;
    puesto;
    y;
    escribe: Plaintext
        / api / commerce / register;
    o;
    simplemente;
    busca;
    el;
    texto;
    de;
    error;
    de;
    Mercado;
    Pago;
    o;
    pagos;
    que;
    arroja;
    tu;
    servidor.
    ;
    Haz;
    esa;
    prueba;
    y;
    dime;
    qué;
    mensaje;
    exacto;
    o;
    qué;
    línea;
    de;
    error;
    de;
    Node.js;
    te;
    aparece;
    ahí;
    en;
    los;
    registros;
    de;
    Google;
    Cloud;
    para;
    ubicar;
    el;
    problema;
    de;
    inmediato.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Perfecto;
    Ya;
    capturamos;
    los;
    registros;
    clave.Como;
    puedes;
    ver;
    en;
    la;
    imagen, las;
    peticiones;
    a / api / commerce / register;
    están;
    devolviendo;
    un;
    Error;
    503, lo;
    que;
    significa;
    que;
    el;
    servidor;
    o;
    contenedor;
    se;
    está;
    cayendo;
    o;
    rechazando;
    la;
    petición;
    al;
    momento;
    de;
    procesarla.
    ;
    Para;
    ver;
    el;
    mensaje;
    exacto;
    de;
    error;
    que;
    genera;
    Node.js;
    por;
    dentro(el, motivo, por, el, cual, lanza, el, error, 503), haz;
    lo;
    siguiente: En;
    esa;
    misma;
    lista;
    de;
    registros, haz;
    clic;
    en;
    la;
    flecha( > );
    que;
    está;
    al;
    lado;
    izquierdo;
    de;
    cualquiera;
    de;
    las;
    líneas;
    rojas;
    con;
    el;
    código;
    503(por, ejemplo, la, de, las, 9, 11, 50).
    ;
    Eso;
    desplegará;
    los;
    detalles;
    del;
    registro.Busca;
    el;
    texto;
    completo;
    o;
    la;
    traza;
    del;
    error(stack, trace);
    que;
    imprime;
    la;
    aplicación;
    para;
    ver;
    qué;
    función;
    o;
    variable;
    falló;
    exactamente;
    en;
    el;
    servidor.
    ;
    Haz;
    clic;
    en;
    la;
    flechita;
    y;
    cuéntame;
    qué;
    detalles;
    muestra;
    el;
    registro;
    desplegado.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Eso;
    es;
    Ya;
    lo;
    abriste.Ahora;
    haz;
    clic;
    en;
    el;
    botón;
    azul;
    que;
    dice;
    Investigar;
    registro(o, haz, clic, en, Expandir, campos, anidados, a, la, par);
    para;
    ver;
    el;
    mensaje;
    completo;
    que;
    está;
    arrojando;
    el;
    servidor;
    por;
    dentro;
    y;
    saber;
    exactamente;
    qué;
    línea;
    falló.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Ah, esa;
    ventana;
    que;
    se;
    abrió;
    es;
    para;
    activar;
    Gemini;
    Cloud;
    Assist;
    en;
    Google;
    Cloud, pero;
    no;
    te;
    muestra;
    el;
    error;
    del;
    servidor;
    de;
    tu;
    aplicación.Esa;
    es;
    una;
    herramienta;
    de;
    asistencia;
    de;
    Google;
    Cloud.
    ;
    Cierra;
    esa;
    ventana;
    flotante;
    de;
    "Obtener Gemini Cloud Assist";
    con;
    la;
    X;
    de;
    arriba;
    a;
    la;
    derecha.
        Luego, para;
    ver;
    el;
    error;
    real;
    de;
    tu;
    aplicación: En;
    la;
    misma;
    pantalla;
    de;
    registros;
    donde;
    estabas, desliza;
    hacia;
    la;
    derecha;
    o;
    baja;
    en;
    los;
    detalles;
    del;
    renglón;
    rojo.
    ;
    Si;
    prefieres;
    verlo;
    más;
    rápido;
    de;
    forma;
    local, ejecuta;
    tu;
    servidor;
    localmente;
    en;
    VS;
    Code;
    con;
    el;
    comando;
    de;
    inicio(por, ejemplo, npm, start, o, node, server.js);
    e;
    intenta;
    registrar;
    el;
    comercio;
    desde;
    tu;
    computadora.Ahí;
    la;
    terminal;
    de;
    VS;
    Code;
    te;
    mostrará;
    el;
    texto;
    exacto;
    del;
    error;
    en;
    tiempo;
    real.
    ;
    Comparar;
    con;
    GPT - 5.5;
    PS;
    C: ;
    Users;
    juanc;
    Senda > node;
    server.js;
    node: internal / modules / cjs / loader;
    1368;
    throw err;
        ^
            Error;
    Cannot;
    find;
    (function ('C:\Users\juanc\Senda\server.js') {
    })('C:\Users\juanc\Senda\server.js' || ('C:\Users\juanc\Senda\server.js' = {}));
    at;
    Function._resolveFilename(node, internal / modules / cjs / loader, 1365, 15);
    at;
    defaultResolveImpl(node, internal / modules / cjs / loader, 1021, 19);
    at;
    resolveForCJSWithHooks(node, internal / modules / cjs / loader, 1026, 22);
    at;
    Function._load(node, internal / modules / cjs / loader, 1175, 37);
    at;
    TracingChannel.traceSync(node, diagnostics_channel, 322, 14);
    at;
    wrapModuleLoad(node, internal / modules / cjs / loader, 235, 24);
    at;
    Function.executeUserEntryPoint[as];
    runMain;
    (node) => ;
    /modules/run_main;
    171;
    5;
    at;
    node: internal / main / run_main_module;
    36;
    49;
    {
        code: 'MODULE_NOT_FOUND',
            requireStack;
        [];
    }
    Node.js;
    v22;
    .18;
    .0;
    El;
    error;
    Cannot;
    find;
    (function ('C:\Users\juanc\Senda\server.js') {
    })('C:\Users\juanc\Senda\server.js' || ('C:\Users\juanc\Senda\server.js' = {}));
    significa;
    que;
    Node.js;
    no;
    encuentra;
    el;
    archivo;
    server.js;
    en;
    esa;
    carpeta;
    porque;
    probablemente;
    el;
    archivo;
    principal;
    de;
    tu;
    backend;
    tiene;
    otro;
    nombre(por, ejemplo, index.js, app.js, o, similar).
    ;
    Para;
    solucionarlo: Mira;
    en;
    la;
    barra;
    lateral;
    izquierda;
    de;
    VS;
    Code;
    para;
    ver;
    qué;
    archivos;
    tienes;
    en;
    la;
    carpeta;
    raíz;
    del;
    proyecto;
    Senda.
    ;
    Identifica;
    cómo;
    se;
    llama;
    el;
    archivo;
    principal;
    del;
    servidor(revisa, también, el, archivo, package.json, en, la, línea, que, dice, "main", o, "start", para, ver, qué, archivo, ejecuta).
    ;
    Ejecuta;
    el;
    comando;
    correcto;
    según;
    el;
    nombre;
    real;
    de;
    tu;
    archivo.Por;
    ejemplo, si;
    se;
    llama;
    index.js, corre;
    Bash;
    node;
    index.js;
    O;
    si;
    tu;
    package.json;
    tiene;
    configurado;
    un;
    script;
    de;
    inicio, simplemente;
    ejecuta: Bash;
    npm;
    start;
    Una;
    vez;
    que;
    arranques;
    el;
    servidor;
    localmente, intenta;
    hacer;
    el;
    registro;
    de;
    nuevo;
    y;
    la;
    terminal;
    de;
    VS;
    Code;
    te;
    mostrará;
    inmediatamente;
    el;
    error;
    exacto;
    que;
    está;
    causando;
    el;
    fallo.
    ;
    Comparar;
    con;
    GPT - 5.5;
    tengo;
    index.js;
    Perfecto;
    Entonces;
    ejecuta;
    el;
    servidor;
    con;
    ese;
    archivo;
    ejecutando: Bash;
    node;
    index.js;
    O;
    si;
    prefieres;
    usar;
    el;
    script;
    configurado: Bash;
    npm;
    start;
    Una;
    vez;
    que;
    veas;
    que;
    el;
    servidor;
    ha;
    arrancado;
    en;
    tu;
    terminal, vuelve;
    a;
    intentar;
    enviar;
    el;
    formulario;
    de;
    registro;
    en;
    tu;
    navegador;
    y;
    fíjate;
    qué;
    mensaje;
    exacto;
    o;
    qué;
    error;
    arroja;
    la;
    terminal;
    de;
    VS;
    Code;
    en;
    ese;
    momento.;
    Con;
    eso;
    sabremos;
    exactamente;
    qué;
    está;
    fallando;
    Comparar;
    con;
    GPT - 5.5;
    Node.js;
    v22;
    .18;
    .0;
    PS;
    C: ;
    Users;
    juanc;
    Senda > node;
    index.js;
    node: internal / modules / cjs / loader;
    1368;
    throw err;
        ^
            Error;
    Cannot;
    find;
    (function ('C:\Users\juanc\Senda\index.js') {
    })('C:\Users\juanc\Senda\index.js' || ('C:\Users\juanc\Senda\index.js' = {}));
    at;
    Function._resolveFilename(node, internal / modules / cjs / loader, 1365, 15);
    at;
    defaultResolveImpl(node, internal / modules / cjs / loader, 1021, 19);
    at;
    resolveForCJSWithHooks(node, internal / modules / cjs / loader, 1026, 22);
    at;
    Function._load(node, internal / modules / cjs / loader, 1175, 37);
    at;
    TracingChannel.traceSync(node, diagnostics_channel, 322, 14);
    at;
    wrapModuleLoad(node, internal / modules / cjs / loader, 235, 24);
    at;
    Function.executeUserEntryPoint[as];
    runMain;
    (node) => ;
    /modules/run_main;
    171;
    5;
    at;
    node: internal / main / run_main_module;
    36;
    49;
    {
        code: 'MODULE_NOT_FOUND',
            requireStack;
        [];
    }
    Node.js;
    v22;
    .18;
    .0;
    Ah, con;
    razón.Si;
    te;
    dice;
    que;
    tampoco;
    encuentra;
    index.js, significa;
    que;
    estás;
    parado;
    en;
    una;
    carpeta;
    o;
    ruta;
    donde;
    no;
    está;
    el;
    archivo;
    principal;
    de;
    Node.js, o;
    el;
    proyecto;
    está;
    estructurado;
    dentro;
    de;
    otra;
    carpeta(por, ejemplo, dentro, de, una, subcarpeta, como, backend, o, src).
    ;
    Hagamos;
    esto;
    en;
    tu;
    terminal;
    de;
    VS;
    Code;
    para;
    encontrarlo;
    rápido: Escribe;
    el;
    siguiente;
    comando;
    para;
    ver;
    los;
    archivos;
    y;
    carpetas;
    que;
    tienes;
    exactamente;
    en;
    la;
    ruta;
    actual: Bash;
    dir;
    Revisa;
    qué;
    carpetas;
    aparecen;
    listadas.Si;
    ves;
    una;
    carpeta;
    llamada;
    backend, src;
    o;
    similar, entra;
    en;
    ella;
    escribiendo: Bash;
    cd;
    nombre_de_la_carpeta;
    O;
    bien, abre;
    el;
    archivo;
    package.json;
    en;
    VS;
    Code, búscale;
    la;
    sección;
    que;
    dice;
    "scripts";
    o;
    "main";
    y;
    ahí;
    te;
    dirá;
    exactamente;
    cómo;
    se;
    llama;
    el;
    archivo;
    de;
    inicio;
    y;
    en;
    qué;
    ruta;
    está;
    ubicado.
    ;
    Dime;
    qué;
    carpetas;
    ves;
    o;
    qué;
    dice;
    tu;
    package.json;
    y;
    te;
    digo;
    el;
    comando;
    exacto;
    para;
    arrancarlo.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Node.js;
    v22;
    .18;
    .0;
    PS;
    C: ;
    Users;
    juanc;
    Senda > dir;
    Directorio: C: ;
    Users;
    juanc;
    Senda;
    Mode;
    LastWriteTime;
    Length;
    Name;
    --;
    --;
    --;
    --;
    --;
    --;
    --;
    -- - --;
    --;
    --;
    --;
    --d;
    --;
    -- - 18 / 6 / 2026;
    10;
    11;
    p.m..vercel;
    d--;
    -- - 14 / 6 / 2026;
    8;
    35;
    p.m.auth_info_baileys;
    d--;
    -- - 24 / 5 / 2026;
    2;
    56;
    p.m.auth_info_baileys_tienda_juan;
    d--;
    -- - 14 / 6 / 2026;
    10;
    19;
    p.m.baileys_auth;
    d--;
    -- - 4 / 8 / 2026;
    12;
    56;
    a.m.dist;
    d--;
    -- - 5 / 8 / 2026;
    10;
    42;
    a.m.node_modules;
    d--;
    -- - 18 / 6 / 2026;
    9;
    56;
    p.m.prisma;
    d--;
    -- - 20 / 6 / 2026;
    5;
    49;
    p.m.public;
    d--;
    -- - 7 / 8 / 2026;
    8;
    26;
    a.m.sessions;
    d--;
    -- - 5 / 8 / 2026;
    9;
    54;
    a.m.src;
    d--;
    -- - 21 / 6 / 2026;
    4;
    46;
    p.m.uploads
        - a--;
    --30 / 7 / 2026;
    11;
    6;
    p.m.;
    1465..env
        - a--;
    --6 / 8 / 2026;
    12;
    17;
    p.m.;
    35..gitignore
        - a--;
    --16 / 7 / 2026;
    9;
    31;
    a.m.;
    10..nvmrc
        - a--;
    --6 / 8 / 2026;
    10;
    23;
    a.m.;
    3095;
    bot - simple.cjs
        - a--;
    --4 / 8 / 2026;
    12;
    12;
    p.m.;
    264;
    Dockerfile
        - a--;
    --6 / 8 / 2026;
    10;
    30;
    a.m.;
    132546;
    package - lock.json
        - a--;
    --6 / 8 / 2026;
    10;
    30;
    a.m.;
    1462;
    package.json
        - a--;
    --14 / 6 / 2026;
    8;
    55;
    p.m.;
    4301;
    qr - test.js
        - a--;
    --31 / 7 / 2026;
    12;
    32;
    p.m.;
    294;
    railway.json
        - a--;
    --14 / 6 / 2026;
    8;
    7;
    p.m.;
    895;
    supabase - schema.sql
        - a--;
    --6 / 8 / 2026;
    10;
    15;
    a.m.;
    1715;
    test - final.cjs
        - a--;
    --14 / 6 / 2026;
    10;
    48;
    p.m.;
    429;
    test - gemini.js
        - a--;
    --6 / 8 / 2026;
    10;
    12;
    a.m.;
    2008;
    test - number.cjs
        - a--;
    --16 / 5 / 2026;
    1;
    27;
    a.m.;
    543;
    test - pg.js
        - a--;
    --4 / 8 / 2026;
    12;
    11;
    p.m.;
    412;
    tsconfig.json
        - a--;
    --18 / 6 / 2026;
    10;
    33;
    p.m.;
    196;
    vercel.json
        - a--;
    --12 / 6 / 2026;
    10;
    39;
    p.m.;
    2206;
    webhook.js
        - a--;
    --6 / 8 / 2026;
    9;
    9;
    a.m.;
    19737;
    whatsapp - bot - final.backup.cjs
        - a--;
    --6 / 8 / 2026;
    12;
    15;
    p.m.;
    12933;
    whatsapp - bot - final.cjs
        - a--;
    --7 / 7 / 2026;
    10;
    39;
    a.m.;
    172;
    whatsapp - service.js
        - a--;
    --14 / 6 / 2026;
    8;
    49;
    p.m.;
    277;
    whatsapp_qr.txt
        - a--;
    --16 / 5 / 2026;
    12;
    1;
    a.m.;
    0;
    {
        -a--;
        --12 / 5 / 2026;
        1;
        6;
        a.m.;
        0;
    }
    -a--;
    --12 / 5 / 2026;
    1;
    6;
    a.m.;
    0;
    Perfecto;
    Ya;
    veo;
    la;
    estructura;
    de;
    tu;
    proyecto.El;
    archivo;
    que;
    inicia;
    el;
    servidor;
    no;
    es;
    server.js;
    ni;
    index.js, sino;
    que;
    está;
    definido;
    en;
    tu;
    archivo;
    package.json.
    ;
    Para;
    iniciar;
    tu;
    aplicación;
    localmente;
    de;
    la;
    forma;
    correcta, ejecuta;
    este;
    comando;
    en;
    tu;
    terminal: Bash;
    npm;
    start;
    Una;
    vez;
    que;
    veas;
    en;
    la;
    terminal;
    que;
    el;
    servidor;
    ha;
    arrancado;
    e;
    iniciado;
    correctamente, vuelve;
    a;
    probar;
    el;
    envío;
    de;
    tu;
    formulario;
    de;
    registro;
    en;
    el;
    navegador.La;
    terminal;
    te;
    mostrará;
    de;
    inmediato;
    cualquier;
    error;
    o;
    traza;
    exacta;
    que;
    ocurra;
    en;
    el;
    backend.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Para;
    salir;
    de;
    dudas;
    rápidamente;
    y;
    ver;
    qué;
    es;
    lo;
    que;
    está;
    fallando;
    al;
    momento;
    de;
    conectarse;
    con;
    el;
    servicio;
    de;
    pagos, revisemos;
    el;
    archivo;
    que;
    maneja;
    esa;
    ruta;
    en;
    el;
    código;
    de;
    tu;
    proyecto.
    ;
    En;
    VS;
    Code, busca;
    en;
    la;
    barra;
    lateral;
    o;
    usa;
    el;
    buscador;
    de;
    archivos;
    para;
    abrir;
    el;
    archivo;
    donde;
    se;
    define;
    el;
    endpoint;
    del;
    backend(/api/commerce / register), que;
    por;
    lo;
    general;
    está;
    dentro;
    de;
    la;
    carpeta;
    src / (por);
    ejemplo, en;
    tus;
    rutas;
    o;
    en;
    el;
    archivo;
    principal;
    del;
    servidor;
    Busca;
    la;
    sección;
    del;
    código;
    que;
    genera;
    el;
    error;
    "Servicio de pagos no disponible";
    o;
    la;
    que;
    interactúa;
    con;
    Mercado;
    Pago.
    ;
    Pega;
    por;
    aquí;
    ese;
    bloque;
    de;
    código;
    del;
    backend;
    para;
    verlo;
    y;
    ajustarlo;
    de;
    inmediato.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Excelente;
    Ya;
    encontramos;
    el;
    archivo;
    exacto;
    gracias;
    a;
    la;
    captura: es;
    commerce.routes.ts;
    dentro;
    de;
    la;
    carpeta;
    src / routes / (que);
    se;
    muestra;
    arriba;
    en;
    la;
    barra;
    de;
    búsqueda;
    de;
    VS;
    Code;
    Abre;
    ese;
    archivo(src / routes / commerce.routes.ts);
    y;
    compárteme;
    el;
    código;
    o;
    la;
    función;
    que;
    maneja;
    la;
    ruta;
    POST;
    para;
    ver;
    qué;
    está;
    fallando;
    al;
    comunicarse;
    con;
    Mercado;
    Pago;
    y;
    arreglarlo;
    de;
    inmediato.
    ;
    Comparar;
    con;
    GPT - 5.5;
    router = Router();
    // Endpoint de registro
    router.post('/register', async (req, res) => {
        try {
            const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;
            // Validar campos requeridos
            if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos'
                });
            }
            // Guardar en Supabase (tabla commerce)
            const { data, error } = await supabase
                .from('commerce')
                .insert({
                rfc,
                business_name,
                tax_regime,
                zip_code,
                phone,
                email,
                csd_cer_base64: csd_cer_base64 || '',
                csd_key_base64: csd_key_base64 || '',
                csd_password: csd_password || '',
                is_active: true,
                is_premium: false,
                invoice_count: 0
            })
                .select()
                .single();
            if (error) {
                console.error('Error al guardar:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
            // Si el usuario envió el certificado en base64 durante el registro, lo subimos a nuestro bucket privado
            if (csd_cer_base64) {
                try {
                    const cerBuffer = Buffer.from(csd_cer_base64, 'base64');
                    const fileName = `${rfc}_certificate.cer`;
                    await uploadCertificate(data.id, cerBuffer, fileName);
                }
                catch (uploadError) {
                    console.error('Aviso: No se pudo subir el archivo .cer al bucket, pero el comercio fue registrado:', uploadError);
                }
            }
            // Éxito
            return res.json({
                success: true,
                message: '✅ ¡Registro exitoso! Ya puedes comenzar a facturar con Senda desde WhatsApp.',
                commerce: {
                    id: data.id,
                    business_name: data.business_name,
                    phone: data.phone
                }
            });
        }
        catch (error) {
            console.error('Error en registro:', error);
            return res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            });
        }
    });
    _default = router;
    Ya;
    lo;
    vi;
    Analizando;
    el;
    código;
    de;
    commerce.routes.ts;
    que;
    acabas;
    de;
    compartir, encontramos;
    exactamente;
    por;
    qué;
    salía;
    el;
    error: El;
    endpoint;
    actual;
    simplemente;
    registra;
    los;
    datos;
    en;
    Supabase;
    y;
    devuelve;
    un;
    mensaje;
    de;
    éxito, pero;
    no;
    está;
    llamando;
    a;
    la;
    API;
    de;
    Mercado;
    Pago;
    para;
    generar;
    el;
    link;
    de;
    pago(init_point).Sin;
    embargo, en;
    tu;
    archivo;
    register.html;
    del;
    frontend, el;
    código;
    sí;
    espera;
    recibir;
    un;
    result.init_point;
    para;
    mostrar;
    el;
    botón;
    de;
    pago;
    de;
    los;
    $50;
    .00;
    MXN.Como;
    la;
    respuesta;
    no;
    trae;
    ese;
    campo, en;
    algunos;
    casos;
    se;
    genera;
    el;
    conflicto;
    o;
    el;
    mensaje;
    de;
    que;
    el;
    servicio;
    de;
    pagos;
    no;
    está;
    disponible.
        Además, hay;
    una;
    restricción;
    importante;
    en;
    la;
    base;
    de;
    datos: si;
    tu;
    tabla;
    en;
    Supabase;
    tiene;
    una;
    restricción;
    de;
    clave;
    única(UNIQUE);
    en;
    el;
    campo;
    rfc, al;
    intentar;
    registrarte;
    de;
    nuevo;
    con;
    el;
    mismo;
    RFC;
    el;
    servidor;
    fallará;
    porque;
    ya;
    existe.
    ;
    Cómo;
    lo;
    solucionamos ?
        Necesitamos : ;
    integrar;
    la;
    llamada;
    a;
    Mercado;
    Pago;
    dentro;
    de;
    este;
    mismo;
    archivo;
    para;
    que;
    devuelva;
    el;
    link;
    de;
    pago(init_point);
    que;
    tu;
    formulario;
    necesita.
    ;
    Dime;
    si;
    tienes;
    configurado;
    ya;
    algún;
    servicio;
    o;
    SDK;
    de;
    Mercado;
    Pago;
    en;
    tu;
    proyecto(por, ejemplo, en, otra, ruta, como, pagos, o, subscripciones);
    para;
    reutilizar;
    esas;
    credenciales;
    e;
    integrarlas;
    aquí;
    mismo;
    de;
    forma;
    limpia.
    ;
    Comparar;
    con;
    GPT - 5.5;
    ya;
    esta;
    integrado;
    mercado;
    pago, de;
    hecho;
    pruebas;
    anteriores;
    salia;
    al;
    boton;
    d;
    epago;
    no;
    entiendo;
    por;
    que;
    ahor;
    ano;
    esta;
    Si;
    el;
    código;
    que;
    compartiste;
    no;
    incluye;
    la;
    lógica;
    de;
    Mercado;
    Pago, es;
    posible;
    que;
    estemos;
    mirando;
    una;
    versión;
    del;
    archivo;
    que;
    no;
    está;
    sincronizada;
    con;
    lo;
    que;
    el;
    frontend;
    espera, o;
    que;
    la;
    lógica;
    de;
    pagos;
    se;
    haya;
    movido;
    a;
    otro;
    lugar.
    ;
    Para;
    encontrar;
    dónde;
    se;
    "escondió";
    esa;
    lógica, hagamos;
    dos;
    verificaciones;
    rápidas: Busca;
    el;
    código;
    de;
    pagos: En;
    la;
    barra;
    de;
    búsqueda;
    de;
    VS;
    Code, escribe;
    MercadoPago;
    o;
    preference.create;
    y;
    mira;
    si;
    aparece;
    en;
    otro;
    archivo(quizás, payments.routes.ts, o, un, controlador, diferente).
    ;
    Revisa;
    los;
    cambios;
    recientes: Como;
    en;
    la;
    consola;
    al;
    iniciar;
    el;
    servidor(la, imagen, que, enviaste);
    decía;
    "MercadoPago inicializado", el;
    código;
    de;
    inicialización;
    existe;
    en;
    algún;
    lado(probablemente, en, index.js, o, un, archivo, de, configuración).
    ;
    Podrías;
    enviarme;
    el;
    contenido;
    del;
    archivo;
    index.js ? Ahí : ;
    es;
    donde;
    probablemente;
    se;
    esté;
    haciendo;
    la;
    configuración;
    inicial;
    y;
    donde;
    veremos;
    si;
    hay;
    otros;
    router.use;
    que;
    estén;
    manejando;
    las;
    rutas;
    de;
    pago;
    que;
    no;
    estamos;
    viendo;
    en;
    commerce.routes.ts.
        También, por;
    favor, abre;
    la;
    consola;
    de;
    "Network"(Red);
    en;
    las;
    herramientas;
    de;
    desarrollador;
    de;
    tu;
    navegador(F12);
    justo;
    cuando;
    le;
    das;
    al;
    botón;
    de;
    "Registrar comercio".Haz;
    clic;
    en;
    la;
    línea;
    roja;
    que;
    aparece;
    ahí;
    y;
    muéstrame;
    el;
    "Response"(la, respuesta, exacta, que, envía, el, servidor);
    eso;
    nos;
    dirá;
    si;
    el;
    servidor;
    está;
    devolviendo;
    un;
    error;
    específico;
    de;
    pago;
    antes;
    de;
    llegar;
    a;
    la;
    base;
    de;
    datos.
    ;
    Comparar;
    con;
    GPT - 5.5;
    mierda;
    que;
    paos;
    que;
    no;
    me;
    aparce;
    mercado;
    pago;
    ahora ?
        El : ;
    motivo;
    por;
    el;
    cual;
    ya;
    no;
    aparece;
    el;
    botón;
    de;
    pago;
    es;
    que;
    el;
    archivo;
    src / routes / commerce.routes.ts;
    que;
    estás;
    utilizando;
    actualmente;
    no;
    tiene;
    integrada;
    la;
    llamada;
    a;
    Mercado;
    Pago.
    ;
    Como;
    puedes;
    ver;
    en;
    el;
    código;
    que;
    me;
    pasaste;
    de;
    ese;
    archivo, al;
    terminar;
    de;
    guardar;
    en;
    Supabase;
    solo;
    responde;
    con;
    un;
    success: true;
    y;
    un;
    mensaje;
    de;
    texto;
    plano, sin;
    generar;
    ni;
    enviar;
    el;
    parámetro;
    init_point.Por;
    lo;
    tanto, el;
    formulario;
    en;
    tu;
    navegador(el, cual, busca, result.init_point, para, inyectar, el, botón);
    se;
    queda;
    sin;
    esa;
    información;
    y;
    muestra;
    el;
    mensaje;
    de;
    error;
    o;
    no;
    despliega;
    la;
    pasarela.
    ;
    En;
    versiones;
    anteriores;
    de;
    tu;
    proyecto;
    seguramente;
    esa;
    ruta;
    tenía;
    la;
    integración;
    con;
    Mercado;
    Pago(creando, una, preferencia, de, pago, con, el, SDK, antes, de, responder, al, cliente).
    ;
    Para;
    recuperarlo;
    y;
    volver;
    a;
    mostrar;
    el;
    botón;
    de;
    $50;
    .00;
    MXN;
    en;
    el;
    modal, necesitamos;
    volver;
    a;
    agregar;
    la;
    lógica;
    de;
    Mercado;
    Pago;
    en;
    tu;
    endpoint / register;
    dentro;
    de;
    src / routes / commerce.routes.ts.;
    Quieres;
    que;
    te;
    pase;
    el;
    fragmento;
    de;
    código;
    adaptado;
    con;
    Mercado;
    Pago;
    para;
    integrarlo;
    de;
    nuevo;
    en;
    ese;
    archivo ?
        Comparar : ;
    con;
    GPT - 5.5;
    dame;
    el;
    codigo;
    completo, pero;
    es;
    importante;
    que;
    esto;
    no;
    vuelva;
    a;
    pasar, porque;
    seguramente;
    con;
    todos;
    los;
    cambios;
    y;
    actualizaciones;
    se;
    elimino;
    mercado;
    pago.debes;
    ser;
    muy;
    cuidadoso;
    de;
    no;
    rimper;
    ninguna;
    funcion;
    ya;
    que;
    senda;
    tienes;
    que;
    salir;
    a;
    produccioe;
    ste;
    fin;
    de;
    semana;
    Tranquilo, vamos;
    a;
    dejarlo;
    listo, robusto;
    y;
    asegurado;
    de;
    una;
    vez;
    por;
    todas;
    para;
    que;
    no;
    vuelva;
    a;
    perderse;
    con;
    ningún;
    cambio.
    ;
    Aquí;
    tienes;
    el;
    código;
    completo;
    y;
    actualizado;
    para;
    tu;
    archivo;
    src / routes / commerce.routes.ts.Este;
    archivo;
    ya;
    incluye;
    la;
    validación, la;
    subida;
    segura;
    del;
    certificado;
    al;
    bucket;
    y, por;
    supuesto, la;
    integración;
    correcta;
    con;
    Mercado;
    Pago;
    para;
    generar;
    la;
    preferencia;
    de;
    pago;
    de;
    los;
    $50;
    .00;
    MXN;
    y;
    devolver;
    el;
    init_point;
    que;
    activa;
    el;
    botón;
    en;
    tu;
    modal.
    ;
    Código;
    actualizado;
    para;
    src / routes / commerce.routes.ts;
    TypeScript;
    router = Router();
    // Configuración de Mercado Pago (asegúrate de que tome tu token de entorno)
    client = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN || ''
    });
    // Endpoint de registro con Mercado Pago integrado
    router.post('/register', async (req, res) => {
        try {
            const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;
            // Validar campos requeridos
            if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos'
                });
            }
            // Guardar en Supabase (tabla commerce)
            const { data, error } = await supabase
                .from('commerce')
                .insert({
                rfc,
                business_name,
                tax_regime,
                zip_code,
                phone,
                email,
                csd_cer_base64: csd_cer_base64 || '',
                csd_key_base64: csd_key_base64 || '',
                csd_password: csd_password || '',
                is_active: true,
                is_premium: false,
                invoice_count: 0
            })
                .select()
                .single();
            if (error) {
                console.error('Error al guardar en Supabase:', error);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
            // Si el usuario envió el certificado en base64, lo subimos al bucket privado
            if (csd_cer_base64) {
                try {
                    const cerBuffer = Buffer.from(csd_cer_base64, 'base64');
                    const fileName = `${rfc}_certificate.cer`;
                    await uploadCertificate(data.id, cerBuffer, fileName);
                }
                catch (uploadError) {
                    console.error('Aviso: No se pudo subir el archivo .cer al bucket:', uploadError);
                }
            }
            // Generar la preferencia de pago en Mercado Pago por $50.00 MXN
            let initPoint = null;
            try {
                const preference = new Preference(client);
                const resultPreference = await preference.create({
                    body: {
                        items: [
                            {
                                id: 'activation_fee',
                                title: 'Activación de Facturación Automática - Senda',
                                quantity: 1,
                                unit_price: 50.00,
                                currency_id: 'MXN'
                            }
                        ],
                        payer: {
                            email: email,
                            phone: {
                                number: phone
                            }
                        },
                        back_urls: {
                            success: `${req.protocol}://${req.get('host')}/success.html`,
                            failure: `${req.protocol}://${req.get('host')}/register.html`,
                            pending: `${req.protocol}://${req.get('host')}/register.html`
                        },
                        auto_return: 'approved'
                    }
                });
                initPoint = resultPreference.init_point;
            }
            catch (mpError) {
                console.error('Error generando la preferencia de Mercado Pago:', mpError);
                // Aunque falle MP por alguna credencial, el comercio ya se creó, pero avisamos
            }
            // Respuesta exitosa incluyendo el init_point para el modal
            return res.json({
                success: true,
                init_point: initPoint,
                message: '✅ ¡Registro exitoso! Completa tu pago para activar WhatsApp.',
                commerce: {
                    id: data.id,
                    business_name: data.business_name,
                    phone: data.phone
                }
            });
        }
        catch (error) {
            console.error('Error crítico en registro:', error);
            return res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            });
        }
    });
    export default router;
    Pasos;
    siguientes;
    para;
    asegurar;
    el;
    despliegue;
    de;
    este;
    fin;
    de;
    semana: Reemplaza;
    el;
    contenido;
    de;
    tu;
    archivo;
    src / routes / commerce.routes.ts;
    con;
    este;
    código.
    ;
    Asegúrate;
    de;
    que;
    en;
    tu;
    archivo.env(y, en, las, variables, de, entorno, de, tu, servidor, en, la, nube);
    esté;
    correctamente;
    configurada;
    la;
    clave;
    de;
    Mercado;
    Pago(MP_ACCESS_TOKEN).
    ;
    Vuelve;
    a;
    compilar;
    tu;
    proyecto;
    si;
    manejas;
    TypeScript(ejecutando, el, comando, de, compilación, o, npm, run, build, si, aplica);
    y;
    pruébalo;
    localmente;
    con;
    npm;
    start.
    ;
    Comparar;
    con;
    GPT - 5.5;
    Gemini;
    es;
    una;
    IA;
    y;
    puede;
    cometer;
    errores.
        Charlar;
    New;
    Chat;
    Page;
    Content;
    Walmart;
    Seller;
    Center;
    https: ; //seller.walmart.com/catalog/item-maintenance/create?returnPATH=%2Fcatalog%2Fadd-items%3FreturnUrl%3D%252Fcatalog%252Flist-items
    Resumir;
    Get;
    a;
    brief;
    overview;
    of;
    the;
    main;
    points;
    and;
    key;
    takeaways;
    AITOPIA;
    The;
    content;
    outlines;
    the;
    benefits;
    and;
    functionalities;
    of;
    the;
    Walmart;
    Seller;
    Center, focusing;
    on;
    various;
    aspects;
    of;
    product;
    AITOPIA[https] //senda-575148645093.europe-west1.run.app](https://senda-575148645093.europe-west1.run.app)
    ;
    Chat;
    grupal;
    Acceso;
    a;
    la;
    Web;
    10;
    Actualizar;
}
catch (e_1) {
    env_1.error = e_1;
    env_1.hasError = true;
}
finally {
    __disposeResources(env_1);
}
