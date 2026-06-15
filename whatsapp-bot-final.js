const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const COMERCIO_WHATSAPP = process.env.COMERCIO_WHATSAPP || '521234567890';

let sockGlobal = null;
const estados = new Map();

// ========== VALIDACIÓN SIMPLE Y DIRECTA ==========
function extraerDatos(texto) {
    console.log('🔍 Procesando:', texto);
    
    // Dividir por espacios
    const partes = texto.trim().split(/\s+/);
    console.log('📦 Partes:', partes);
    
    // Buscar RFC (12-13 caracteres, letras y números)
    let rfc = null;
    let email = null;
    let codigoPostal = null;
    let regimenFiscal = null;
    let usoCfdi = null;
    let razonSocial = [];
    
    for (let i = 0; i < partes.length; i++) {
        const p = partes[i];
        
        // RFC: 12-13 caracteres alfanuméricos
        if (!rfc && p.match(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/i)) {
            rfc = p.toUpperCase();
            continue;
        }
        
        // Email
        if (!email && p.match(/^[\w.-]+@[\w.-]+\.\w{2,}$/i)) {
            email = p.toLowerCase();
            continue;
        }
        
        // Código Postal: 5 dígitos
        if (!codigoPostal && p.match(/^\d{5}$/)) {
            codigoPostal = p;
            continue;
        }
        
        // Régimen Fiscal: 3 dígitos (601, 612, etc.)
        if (!regimenFiscal && p.match(/^(601|603|605|606|608|610|611|612|614|616|620|621|622|623|624|625)$/)) {
            regimenFiscal = p;
            continue;
        }
        
        // Uso CFDI: G + 2 dígitos
        if (!usoCfdi && p.match(/^G\d{2}$/i)) {
            usoCfdi = p.toUpperCase();
            continue;
        }
        
        // Todo lo demás es parte de la razón social
        razonSocial.push(p);
    }
    
    razonSocial = razonSocial.join(' ');
    
    const todos_completos = rfc && razonSocial && regimenFiscal && usoCfdi && codigoPostal && email;
    
    const resultado = {
        rfc: rfc,
        razonSocial: razonSocial,
        regimenFiscal: regimenFiscal,
        usoCfdi: usoCfdi,
        codigoPostal: codigoPostal,
        email: email,
        todos_completos: todos_completos
    };
    
    console.log('✅ Resultado:', resultado);
    return resultado;
}

async function guardarFactura(datos, sender) {
    const { data, error } = await supabase
        .from('Invoice')
        .insert({
            customer_rfc: datos.rfc,
            customer_email: datos.email,
            razon_social: datos.razonSocial,
            regimen_fiscal: datos.regimenFiscal,
            uso_cfdi: datos.usoCfdi,
            codigo_postal: datos.codigoPostal,
            status: 'PENDING',
            phone_number: sender,
            created_at: new Date()
        })
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

async function notificarComercio(invoice, datosCliente) {
    if (!sockGlobal) return;
    
    const mensaje = `📋 *NUEVA FACTURA PENDIENTE*
Cliente: ${datosCliente.razonSocial}
RFC: ${datosCliente.rfc}
Email: ${datosCliente.email}
Régimen: ${datosCliente.regimenFiscal}
Uso CFDI: ${datosCliente.usoCfdi}
CP: ${datosCliente.codigoPostal}
ID: ${invoice.id}

Responde: CONFIRMAR ${invoice.id} o RECHAZAR ${invoice.id} [motivo]`;
    
    await sockGlobal.sendMessage(COMERCIO_WHATSAPP + '@s.whatsapp.net', { text: mensaje });
    console.log('📨 Notificación enviada al comercio');
}

async function procesarMensaje(text, sender) {
    const estado = estados.get(sender) || 'INICIO';
    console.log(`Estado de ${sender}: ${estado}`);
    
    if (estado === 'INICIO') {
        if (text.toLowerCase().includes('factura')) {
            estados.set(sender, 'ESPERANDO_DATOS');
            return `📋 *Factura Senda*

Para generar tu factura, envíame en UNA SOLA LÍNEA:

RFC | Razón Social | Régimen Fiscal | Uso CFDI | CP | Email

*Ejemplo:*
XAXX010101000 Juan Perez 612 G03 06140 juan@mail.com`;
        }
        return "Hola, soy Senda Bot. Escribe *Factura* para solicitar una.";
    }
    
    if (estado === 'ESPERANDO_DATOS') {
        const datos = extraerDatos(text);
        
        if (datos.todos_completos) {
            const invoice = await guardarFactura(datos, sender);
            await notificarComercio(invoice, datos);
            estados.set(sender, 'COMPLETADO');
            return `✅ *Datos recibidos correctamente*

RFC: ${datos.rfc}
Razón Social: ${datos.razonSocial}
Régimen Fiscal: ${datos.regimenFiscal}
Uso CFDI: ${datos.usoCfdi}
Código Postal: ${datos.codigoPostal}
Email: ${datos.email}

Tu factura está siendo procesada. El comercio la revisará en breve.`;
        } else {
            return `❌ No pude entender tus datos.

Asegúrate de enviarlos en UNA SOLA LÍNEA con este orden:

RFC | Razón Social | Régimen Fiscal | Uso CFDI | CP | Email

*Ejemplo correcto:*
XAXX010101000 Juan Perez 612 G03 06140 juan@mail.com

Inténtalo nuevamente.`;
        }
    }
    
    if (estado === 'COMPLETADO') {
        if (text.toLowerCase().includes('factura')) {
            estados.set(sender, 'ESPERANDO_DATOS');
            return "Ok, nueva factura. Envíame tus datos en una sola línea.";
        }
        return "Tu factura ya está en proceso. Escribe *Factura* para una nueva.";
    }
    
    return "Escribe *Factura* para comenzar.";
}

// Endpoint registro comercio
app.post('/api/comercio/registrar', async (req, res) => {
    try {
        const { phoneNumber, nombreComercio, rfc, razonSocial, regimenFiscal, codigoPostal, correoComercio } = req.body;
        const { data, error } = await supabase.from('Commerce').insert({
            phone_number: phoneNumber, nombre_comercio: nombreComercio, rfc, razon_social: razonSocial,
            regimen_fiscal: regimenFiscal, codigo_postal: codigoPostal, correo_comercio: correoComercio, status: 'ACTIVE'
        }).select().single();
        if (error) throw error;
        res.json({ success: true, message: 'Comercio registrado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => console.log('🚀 API en http://localhost:3001'));

// WhatsApp Bot
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const sock = makeWASocket({ auth: state, browser: ['Senda Bot', 'Chrome', '1.0.0'] });
    sockGlobal = sock;
    
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log('📱 Escanea este QR:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            console.log('✅ Bot conectado a WhatsApp!');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        console.log(`📨 ${sender}: ${text}`);
        
        // Comercio
        if (sender.includes(COMERCIO_WHATSAPP)) {
            const textoLower = text.toLowerCase();
            if (textoLower.startsWith('confirmar')) {
                const invoiceId = text.split(' ')[1];
                if (invoiceId) {
                    await supabase.from('Invoice').update({ status: 'CONFIRMED' }).eq('id', parseInt(invoiceId));
                    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', parseInt(invoiceId)).single();
                    if (invoice?.phone_number) {
                        await sock.sendMessage(invoice.phone_number, { text: `✅ Factura confirmada. Recibirás el CFDI en ${invoice.customer_email}` });
                    }
                    await sock.sendMessage(sender, { text: `✅ Factura ${invoiceId} confirmada` });
                }
            } else if (textoLower.startsWith('rechazar')) {
                const parts = text.split(' ');
                const invoiceId = parts[1];
                const motivo = parts.slice(2).join(' ') || 'Sin motivo';
                if (invoiceId) {
                    await supabase.from('Invoice').update({ status: 'REJECTED' }).eq('id', parseInt(invoiceId));
                    const { data: invoice } = await supabase.from('Invoice').select('*').eq('id', parseInt(invoiceId)).single();
                    if (invoice?.phone_number) {
                        await sock.sendMessage(invoice.phone_number, { text: `❌ Factura rechazada. Motivo: ${motivo}` });
                    }
                    await sock.sendMessage(sender, { text: `❌ Factura ${invoiceId} rechazada` });
                }
            }
            return;
        }
        
        // Cliente normal
        const respuesta = await procesarMensaje(text, sender);
        await sock.sendMessage(sender, { text: respuesta });
    });
}

connectToWhatsApp().catch(console.error);