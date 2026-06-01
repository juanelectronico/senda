import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

export async function connectToWhatsApp(commerceId: string) {
  const authFolder = `auth_info_baileys_${commerceId}`;
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  console.log(`\n📡 [Senda] Abriendo canal seguro de comunicación para: ${commerceId}...`);

  let version: [number, number, number] = [2, 3000, 1015901307]; 
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
  } catch (e) {
    console.log(`⚠️ [Senda] Usando versión de respaldo para WhatsApp Web.`);
  }

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, 
    logger: pino({ level: 'silent' }),
    version,
    browser: ['Windows', 'Chrome', '122.0.0.0'], 
    shouldSyncHistoryMessage: () => false, 
    connectTimeoutMs: 30000,               
    defaultQueryTimeoutMs: 0,              
    keepAliveIntervalMs: 20000             
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrImagePath = path.join(process.cwd(), 'qr.png');
      try {
        await QRCode.toFile(qrImagePath, qr, { scale: 8 });
        console.log('\n==================================================');
        console.log('✨ [Senda] ¡CÓDIGO QR GENERADO CON ÉXITO! ✨');
        console.log('👉 Abre el archivo \'qr.png\' en la raíz de tu proyecto.');
        console.log('==================================================\n');
      } catch (err) {
        console.error('❌ [Senda] Error al guardar el archivo QR:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
        }
        setTimeout(() => connectToWhatsApp(commerceId), 3000);
      } else {
        setTimeout(() => connectToWhatsApp(commerceId), 5000);
      }
    } else if (connection === 'open') {
      console.log(`\n🔥 ¡🚀 Senda conectado exitosamente al WhatsApp de: ${commerceId}! 🔥`);
      const qrImagePath = path.join(process.cwd(), 'qr.png');
      if (fs.existsSync(qrImagePath)) {
        fs.unlinkSync(qrImagePath);
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid || '';
    if (remoteJid.endsWith('@g.us')) return; 

    const originalText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const text = originalText.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    console.log(`📱 [Senda] Mensaje de [${remoteJid}]: "${originalText}"`);

    if (text.includes('factura') || text.includes('facturar')) {
      console.log(`🤖 [Senda] Palabra clave detectada. Enviando link...`);
      
      // =========================================================================
      // ⚠️ CONFIGURACIÓN DEL ENLACE DE INTERNET
      // Pon entre las comillas el link completo que termine en ngrok-free.app
      // Ejemplo: 'https://1234-56-78.ngrok-free.app'
      // =========================================================================
      const miLinkPublico = 'TU_LINK_DE_NGROK_AQUI'; 
      
      const linkFacturacion = `${miLinkPublico}/factura/${commerceId}`;
      const respuesta = `¡Hola! Claro que sí, con gusto te ayudo a generar tu factura. 📄✨\n\nPor favor, ingresa al siguiente enlace seguro para registrar tus datos fiscales:\n👉 ${linkFacturacion}\n\nEl proceso toma menos de un minuto. ¡Gracias por tu compra!`;

      await sock.sendMessage(remoteJid, { text: respuesta });
      console.log(`✅ [Senda] Enlace público enviado.`);
    }
  });
}