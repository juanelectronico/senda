const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config();

// Configuración
const app = express();
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const geminiApiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K6pX_WHhQkc9NZEG-GH4Ytprw13x9kXX0tFtYCt2N0wQ';

// ========== FUNCIÓN PARA LLAMAR A GEMINI ==========
async function callGemini(prompt) {
    return new Promise((resolve, reject) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        
        const data = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type':application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const request = https.request(url, options, (response) => {
            let body = '';
            response.on('data', (chunk) => body += chunk);
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const respuesta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    resolve(respuesta);
                } catch (err) {
                    reject(err);
                }
            });
        });
        
        request.on('error', reject);
        request.write(data);
        request.end();
    });
}

// ========== FUNCIÓN PARA VALIDAR DATOS CON GEMINI ==========
async function validarDatosFiscales(mensajeCliente) {
    const prompt = `Eres un validador de datos fiscales. Analiza el siguiente mensaje del cliente y extrae los datos:

Mensaje: "${mensajeCliente}"

Responde SOLO en formato JSON, sin texto adicional:
{
    "rfc": "RFC encontrado o null",
    "razonSocial": "Razón Social encontrada o null",
    "regimenFiscal": "Régimen Fiscal encontrado o null",
    "usoCfdi": "Uso CFDI encontrado o null",
    "codigoPostal": "Código Postal encontrado o null",
    "email": "Email encontrado o null",
    "todos_completos": true,
    "faltantes": []
}`;

    const respuesta = await callGemini(prompt);
    try {
        const parsed = JSON.parse(respuesta);
        return parsed;
    } catch {
        return { todos_completos: false, errores: { general: "No se pudieron procesar los datos" } };
    }
}

// ========== FUNCIÓN PARA OBTENER O CREAR SESIÓN ==========
async function getOrCreateSession(phoneNumber) {
    const { data } = await supabase
        .from('ChatSession')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();
    
    if (!data) {
        const { data: newData } = await supabase
            .from('ChatSession')
            .insert({ phone_number: phoneNumber, estado: 'INICIO', datos_parciales: {} })
            .select()
            .single();
        return newData;
    }
    return data;
}

// ========== FUNCIÓN PARA ACTUALIZAR SESIÓN ==========
async function updateSession(phoneNumber, updates) {
    await supabase
        .from('ChatSession')
        .update(updates)
        .eq('phone_number', phoneNumber);
}

// ========== FUNCIÓN PARA PROCESAR MENSAJE ==========
async function procesarMensaje(phoneNumber, message) {
    console.log(`📨 Mensaje de ${phoneNumber}: ${message}`);
    
    const session = await getOrCreateSession(phoneNumber);
    let respuesta = '';
    
    if (session.estado === 'INICIO') {
        if (message.toLowerCase().includes('factura')) {
            respuesta = `Claro. Para generar tu factura, necesito:
                
📋 RFC:
🏢 Razón Social:
⚖️ Régimen Fiscal (ej. 601, 612):
📄 Uso CFDI (ej. G01, G03):
📮 Código Postal:
📧 Correo electrónico:

Envíame todos los datos en este orden en un solo mensaje`;
            await updateSession(phoneNumber, { estado: 'ESPERANDO_DATOS' });
        } else {
            respuesta = "Hola, soy Senda Bot. Si necesitas una factura, escribe 'Quiero mi factura'";
        }
    } 
    else if (session.estado === 'ESPERANDO_DATOS') {
        const validacion = await validarDatosFiscales(message);
        
        if (validacion.todos_completos) {
            const { data: invoice } = await supabase
                .from('Invoice')
                .insert({
                    customer_rfc: validacion.rfc,
                    customer_email: validacion.email,
                    razon_social: validacion.razonSocial,
                    regimen_fiscal: validacion.regimenFiscal,
                    uso_cfdi: validacion.usoCfdi,
                    codigo_postal: validacion.codigoPostal,
                    commerce_id: 'tienda_juan',
                    status: 'PENDING',
                    created_at: new Date()
                })
                .select()
                .single();
            
            await updateSession(phoneNumber, { 
                estado: 'COMPLETADO', 
                pending_invoice_id: invoice.id,
                datos_parciales: validacion
            });
            
            console.log(`📨 NOTIFICACIÓN AL COMERCIO:
Nueva factura pendiente:
Cliente: ${validacion.razonSocial}
RFC: ${validacion.rfc}
ID: ${invoice.id}`);
            
            respuesta = `✅ Datos recibidos correctamente.
Tu factura está siendo procesada.
El comercio la revisará en breve.`;
            
        } else if (validacion.faltantes && validacion.faltantes.length > 0) {
            const faltantes = validacion.faltantes.join(', ');
            respuesta = `Gracias. Solo me falta: ${faltantes}
¿Me lo proporcionas?`;
            await updateSession(phoneNumber, { 
                estado: 'ESPERANDO_DATOS',
                datos_parciales: validacion 
            });
        } else {
            respuesta = `❌ No pude procesar tus datos. Por favor, envíalos en este formato:

RFC: tu_rfc
Razón Social: tu_razon_social
Régimen Fiscal: 612
Uso CFDI: G03
Código Postal: 06140
Correo: tu@email.com`;
        }
    }
    
    return respuesta;
}

// ========== INICIAR BOT DE WHATSAPP ==========
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state
    });
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Escanea este código QR con WhatsApp:');
            // Mostrar QR pequeño en terminal
            qrcode.generate(qr, { small: true });
            // Guardar QR como imagen
            QRCode.toFile('whatsapp-qr.png', qr, function (err) {
                if (err) throw err;
                console.log('📱 QR también guardado como whatsapp-qr.png');
                console.log('📁 Abre el archivo whatsapp-qr.png para escanearlo');
            });
        }
        
        if (connection === 'open') {
            console.log('✅ WhatsApp conectado exitosamente!');
            console.log('💬 El bot está listo para recibir mensajes');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexión cerrada, reconectando...');
            if (shouldReconnect) {
                startWhatsAppBot();
            }
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (messageText) {
            const response = await procesarMensaje(sender, messageText);
            await sock.sendMessage(sender, { text: response });
        }
    });
    
    return sock;
}

// ========== ENDPOINT PARA QUE EL COMERCIO CONFIRME ==========
app.post('/api/comercio/confirmar', async (req, res) => {
    const { invoiceId, confirmar, motivo } = req.body;
    
    if (confirmar) {
        await supabase
            .from('Invoice')
            .update({ status: 'CONFIRMED' })
            .eq('id', invoiceId);
        
        console.log(`✅ Factura ${invoiceId} confirmada`);
        res.json({ success: true, message: 'Factura confirmada' });
    } else {
        await supabase
            .from('Invoice')
            .update({ status: 'REJECTED' })
            .eq('id', invoiceId);
        
        console.log(`❌ Factura ${invoiceId} rechazada. Motivo: ${motivo}`);
        res.json({ success: true, message: 'Factura rechazada' });
    }
});

// ========== ENDPOINT PARA LISTAR FACTURAS PENDIENTES ==========
app.get('/api/comercio/pendientes', async (req, res) => {
    const { data } = await supabase
        .from('Invoice')
        .select('*')
        .eq('status', 'PENDING');
    
    res.json(data);
});

// Iniciar servidor HTTP y WhatsApp
app.listen(3001, () => {
    console.log('🚀 Servidor API corriendo en http://localhost:3001');
    console.log('🏪 Endpoint confirmación: POST /api/comercio/confirmar');
    console.log('📋 Facturas pendientes: GET /api/comercio/pendientes');
});

startWhatsAppBot().catch(console.error);