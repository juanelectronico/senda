import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import * as https from 'https';
import 'dotenv/config';

const geminiApiKey = process.env.GEMINI_API_KEY;

// ========== FUNCIÓN PARA LLAMAR A GEMINI ==========
async function callGemini(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
        
        const data = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data).toString()
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

// ========== FUNCIÓN DE INICIO DEL BOT DE WHATSAPP ==========
export async function startWhatsAppBot() {
    console.log('🤖 Iniciando conexión con WhatsApp...');
    
    // Carpeta donde se guardará la sesión para persistir en Railway
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 Escanea el siguiente código QR en los logs:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                startWhatsAppBot();
            }
        } else if (connection === 'open') {
            console.log('✅ ¡WhatsApp conectado exitosamente!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }: any) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageType = Object.keys(m.message)[0];
        const sender = m.key.remoteJid;
        let textMessage = '';

        if (messageType === 'conversation') {
            textMessage = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            textMessage = m.message.extendedTextMessage.text;
        }

        if (textMessage && sender) {
            console.log(`📩 Mensaje recibido de ${sender}: ${textMessage}`);
            
            const prompt = `Eres Senda Bot, un asistente virtual experto en facturación electrónica en México (SAT) y alta de comercios. Responde de forma amable, clara y concisa a la siguiente duda del usuario: "${textMessage}"`;
            
            try {
                const respuestaIA = await callGemini(prompt);
                await sock.sendMessage(sender, { text: respuestaIA });
            } catch (error) {
                console.error('Error al responder con IA:', error);
                await sock.sendMessage(sender, { text: 'Lo siento, tuve un problema procesando tu mensaje.' });
            }
        }
    });
}