// src/services/whatsapp.service.ts
import { 
  default as makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const geminiApiKey = process.env.GEMINI_API_KEY;

// ============================================
// 0. UTILIDAD: Formatear número de teléfono
// ============================================
function formatPhoneNumber(raw: string): string {
  let clean = raw.replace(/\D/g, '');
  if (clean.startsWith('52') && clean.length === 12) return clean;
  if (clean.startsWith('52') && clean.length === 11) return '52' + '1' + clean.slice(2);
  if (clean.length === 10) return '52' + '1' + clean;
  return clean;
}

// ============================================
// 1. INTERFACES Y TIPOS
// ============================================
interface SessionInstance {
  sock: any;
  isPairing: boolean;
  createdAt: Date;
  sessionPath: string;
  cleanupTimeout: NodeJS.Timeout | null;
}

interface PairingRequest {
  commerceId: string;
  phoneNumber: string;
  timestamp: Date;
  resolving: boolean;
}

// ============================================
// 2. ALMACENES EN MEMORIA
// ============================================
export const pairingCodes = new Map<string, string>();
const activeSessions = new Map<string, SessionInstance>();
const pairingLocks = new Map<string, Promise<string>>();
const pendingPairings = new Map<string, PairingRequest>();

// ============================================
// 3. CONFIGURACIÓN
// ============================================
const CONFIG = {
  MAX_RETRIES: 5,
  PAIRING_DELAY_MS: 5000,
  RECONNECT_DELAY_MS: 5000,
  SESSION_CLEANUP_DELAY_MS: 2000,
  MAX_PAIRING_ATTEMPTS: 3,
  STATE_DIR: path.join(process.cwd(), 'auth_info_baileys'),
  CONNECTION_TIMEOUT_MS: 60000,
};

if (!fs.existsSync(CONFIG.STATE_DIR)) {
  fs.mkdirSync(CONFIG.STATE_DIR, { recursive: true });
}

// ============================================
// 4. FUNCIÓN GEMINI
// ============================================
async function callGemini(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const data = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
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

// ============================================
// 5. FUNCIÓN PRINCIPAL (CON LIMPIEZA PERMANENTE)
// ============================================
export async function startWhatsAppBotForCommerce(
  commerceId: string, 
  phoneNumber: string,
  forceNew: boolean = false
): Promise<string> {
  if (!commerceId) throw new Error('commerceId es requerido');
  if (!phoneNumber) throw new Error('phoneNumber es requerido');
  
  const cleanPhone = formatPhoneNumber(phoneNumber);
  if (cleanPhone.length < 10) {
    throw new Error(`Número inválido: ${phoneNumber}`);
  }

  console.log(`🤖 [${commerceId}] Iniciando sesión de WhatsApp para ${cleanPhone}...`);

  // 🔹 SIEMPRE limpiar sesión si forceNew es true O si el número cambió
  const existingSession = activeSessions.get(commerceId);
  if (forceNew || (existingSession && existingSession.sock?.user && existingSession.sock.user.id !== cleanPhone)) {
    console.log(`🧹 [${commerceId}] Limpiando sesión anterior (forceNew=${forceNew})...`);
    await cleanupSession(commerceId, true);
    pairingCodes.delete(commerceId);
  }

  // Verificar si ya hay sesión activa (después de posible limpieza)
  const sessionAfterCleanup = activeSessions.get(commerceId);
  if (!forceNew && sessionAfterCleanup && sessionAfterCleanup.sock?.user) {
    console.log(`✅ [${commerceId}] Sesión activa encontrada, usando existente`);
    const existingCode = pairingCodes.get(commerceId);
    if (existingCode) return existingCode;
  }

  // Control de concurrencia
  const lockKey = `${commerceId}:${cleanPhone}`;
  if (pairingLocks.has(lockKey)) {
    console.log(`🔄 [${commerceId}] Emparejamiento ya en progreso, esperando resultado...`);
    return await pairingLocks.get(lockKey)!;
  }

  console.log(`🔒 [${commerceId}] Adquiriendo lock para emparejamiento...`);
  const pairingPromise = performPairingWithLock(commerceId, cleanPhone, true) // 👈 SIEMPRE forceNew true para generar nuevo código
    .finally(() => {
      pairingLocks.delete(lockKey);
      console.log(`🔓 [${commerceId}] Lock liberado`);
    });
  pairingLocks.set(lockKey, pairingPromise);
  return await pairingPromise;
}

// ============================================
// 6. PERFORM PAIRING
// ============================================
async function performPairingWithLock(
  commerceId: string,
  cleanPhone: string,
  forceNew: boolean
): Promise<string> {
  console.log(`🚀 [${commerceId}] Iniciando proceso de emparejamiento...`);
  await cleanupSession(commerceId, forceNew);

  const sessionPath = path.join(CONFIG.STATE_DIR, commerceId);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  pendingPairings.set(commerceId, {
    commerceId,
    phoneNumber: cleanPhone,
    timestamp: new Date(),
    resolving: false
  });

  try {
    const sock = await createSocketWithRetry(commerceId, cleanPhone, sessionPath);
    activeSessions.set(commerceId, {
      sock,
      isPairing: true,
      createdAt: new Date(),
      sessionPath,
      cleanupTimeout: null
    });
    setupEventListeners(sock, commerceId, cleanPhone);
    
    const code = await requestPairingCodeWithRetry(sock, commerceId, cleanPhone);
    
    if (code !== 'ALREADY_AUTHENTICATED') {
      pairingCodes.set(commerceId, code);
      console.log(`💾 [${commerceId}] Código guardado. Tamaño: ${pairingCodes.size}`);
    }
    
    const instance = activeSessions.get(commerceId);
    if (instance) instance.isPairing = false;
    
    if (code === 'ALREADY_AUTHENTICATED') {
      console.log(`✅ [${commerceId}] Sesión ya autenticada, no se necesita código`);
    } else {
      console.log(`✅ [${commerceId}] Código generado exitosamente`);
    }
    return code;
  } catch (error) {
    console.error(`❌ [${commerceId}] Error en emparejamiento:`, error);
    await cleanupSession(commerceId, true);
    throw error;
  } finally {
    pendingPairings.delete(commerceId);
  }
}

// ============================================
// 7. CREAR SOCKET
// ============================================
async function createSocketWithRetry(
  commerceId: string,
  cleanPhone: string,
  sessionPath: string,
  retries: number = CONFIG.MAX_RETRIES
): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 [${commerceId}] Intento ${attempt}/${retries} de conexión...`);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`📱 [${commerceId}] Versión: ${version.join('.')}, ¿Última?: ${isLatest}`);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const sock = makeWASocket({
        version,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: CONFIG.CONNECTION_TIMEOUT_MS,
        defaultQueryTimeoutMs: CONFIG.CONNECTION_TIMEOUT_MS,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: false,
        getMessage: async () => null
      });
      sock.ev.on('creds.update', saveCreds);
      console.log(`⏳ [${commerceId}] Esperando 8 segundos para que Baileys estabilice...`);
      await sleep(8000);
      console.log(`✅ [${commerceId}] Socket creado (con espera fija de 8s)`);
      return sock;
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ [${commerceId}] Error en intento ${attempt}:`, error);
      if (attempt === retries) throw new Error(`Fallo después de ${retries} intentos: ${lastError.message}`);
      const delay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, CONFIG.PAIRING_DELAY_MS * 2);
      console.log(`⏳ [${commerceId}] Esperando ${delay}ms antes de reintentar...`);
      await sleep(delay);
    }
  }
  throw new Error(`[${commerceId}] No se pudo crear el socket después de todos los intentos`);
}

// ============================================
// 8. SOLICITAR CÓDIGO (QR o PAIRING CODE)
// ============================================
async function requestPairingCodeWithRetry(
  sock: any,
  commerceId: string,
  cleanPhone: string,
  maxAttempts: number = CONFIG.MAX_PAIRING_ATTEMPTS
): Promise<string> {
  console.log(`🔑 [${commerceId}] Esperando código de vinculación...`);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutId: NodeJS.Timeout;

    timeoutId = setTimeout(() => {
      if (!resolved) {
        sock.ev.off('connection.update', handler);
        reject(new Error(`Timeout esperando código después de ${CONFIG.CONNECTION_TIMEOUT_MS}ms`));
      }
    }, CONFIG.CONNECTION_TIMEOUT_MS);

    const handler = (update: any) => {
      console.log(`📡 [${commerceId}] Estado:`, {
        connection: update.connection,
        hasPairingCode: !!update.pairingCode,
        hasQR: !!update.qr,
        hasUser: !!sock.user
      });

      if (sock.user) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          sock.ev.off('connection.update', handler);
          console.log(`✅ [${commerceId}] Ya autenticado`);
          resolve('ALREADY_AUTHENTICATED');
        }
        return;
      }

      const code = update.pairingCode || update.qr;
      if (code && !resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        sock.ev.off('connection.update', handler);

        const type = update.pairingCode ? 'pairing' : 'qr';
        console.log(`📱 [${commerceId}] Código ${type} generado (longitud: ${code.length})`);
        console.log('='.repeat(100));
        if (type === 'pairing') {
          console.log('📱 PAIRING CODE - INGRESA ESTE CÓDIGO EN WHATSAPP:');
          console.log(`👉 ${code}`);
        } else {
          console.log('📱 QR - COPIA ESTE TEXTO PARA GENERAR LA IMAGEN:');
          console.log(code);
        }
        console.log('='.repeat(100));
        
        pairingCodes.set(commerceId, code);
        console.log(`💾 [${commerceId}] Código guardado. Tamaño: ${pairingCodes.size}`);
        resolve(code);
      }

      if (update.connection === 'close' && !resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        sock.ev.off('connection.update', handler);
        const error = update.lastDisconnect?.error;
        const statusCode = (error as any)?.output?.statusCode;
        reject(new Error(`Conexión cerrada: ${error?.message || 'Error desconocido'} (${statusCode})`));
      }
    };

    sock.ev.on('connection.update', handler);

    if (sock.user && !resolved) {
      resolved = true;
      clearTimeout(timeoutId);
      sock.ev.off('connection.update', handler);
      console.log(`✅ [${commerceId}] Usuario ya existente: ${sock.user.id}`);
      resolve('ALREADY_AUTHENTICATED');
    }

    if (!resolved && !sock.user) {
      console.log(`🔑 [${commerceId}] Solicitando código...`);
      sock.requestPairingCode(cleanPhone).catch((err: any) => {
        console.log(`⚠️ [${commerceId}] Pairing code no disponible, esperando QR...`, err.message);
      });
    }
  });
}

// ============================================
// 9. EVENT LISTENERS
// ============================================
function setupEventListeners(sock: any, commerceId: string, cleanPhone: string): void {
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect } = update;
    
    if (update.pairingCode) {
      console.log(`🔑 [${commerceId}] Pairing code recibido en event listener: ${update.pairingCode}`);
      pairingCodes.set(commerceId, update.pairingCode);
    }
    if (update.qr) {
      console.log(`📱 [${commerceId}] QR generado (longitud: ${update.qr.length})`);
      if (!pairingCodes.has(commerceId)) {
        pairingCodes.set(commerceId, update.qr);
      }
    }

    if (connection === 'close') {
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      const errorMessage = error?.message || 'Error desconocido';
      console.log(`⚠️ [${commerceId}] Conexión cerrada. Código: ${statusCode}, Error: ${errorMessage}`);
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 428) {
        console.log(`🔒 [${commerceId}] Sesión cerrada (${statusCode}). Limpiando...`);
        pairingCodes.delete(commerceId);
        await cleanupSession(commerceId, true);
      } else {
        console.log(`⚠️ [${commerceId}] Error temporal (${statusCode}). Reconectando...`);
        const instance = activeSessions.get(commerceId);
        if (instance?.cleanupTimeout) clearTimeout(instance.cleanupTimeout);
        const timeout = setTimeout(() => {
          console.log(`🔄 [${commerceId}] Ejecutando reconexión programada...`);
          startWhatsAppBotForCommerce(commerceId, cleanPhone, true).catch(console.error);
        }, CONFIG.RECONNECT_DELAY_MS);
        if (instance) instance.cleanupTimeout = timeout;
      }
    } else if (connection === 'open') {
      console.log(`✅ [${commerceId}] ¡WhatsApp conectado exitosamente!`);
      if (sock.user) pairingCodes.delete(commerceId);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }: any) => {
    try {
      const m = messages[0];
      if (!m.message || m.key.fromMe) return;
      const messageType = Object.keys(m.message)[0];
      const sender = m.key.remoteJid;
      let textMessage = '';
      if (messageType === 'conversation') textMessage = m.message.conversation;
      else if (messageType === 'extendedTextMessage') textMessage = m.message.extendedTextMessage.text;
      if (textMessage && sender) {
        console.log(`📩 [${commerceId}] Mensaje recibido de ${sender}: ${textMessage}`);
        const prompt = `Eres Senda Bot, un asistente virtual experto en facturación electrónica en México (SAT) y alta de comercios. Responde de forma amable, clara y concisa a la siguiente duda del usuario: "${textMessage}"`;
        const respuestaIA = await callGemini(prompt);
        await sock.sendMessage(sender, { text: respuestaIA });
        console.log(`✅ [${commerceId}] Respuesta enviada a ${sender}`);
      }
    } catch (error) {
      console.error(`❌ [${commerceId}] Error procesando mensaje:`, error);
    }
  });

  let presenceCount = 0;
  let lastPresenceLog = Date.now();
  sock.ev.on('presence.update', () => {
    presenceCount++;
    const now = Date.now();
    if (now - lastPresenceLog > 60000) {
      console.log(`👤 [${commerceId}] ${presenceCount} actualizaciones de presencia`);
      presenceCount = 0;
      lastPresenceLog = now;
    }
  });
}

// ============================================
// 10. LIMPIEZA DE SESIONES
// ============================================
async function cleanupSession(commerceId: string, deleteState: boolean = true): Promise<void> {
  console.log(`🧹 [${commerceId}] Limpiando sesión...`);
  const instance = activeSessions.get(commerceId);
  if (instance?.cleanupTimeout) {
    clearTimeout(instance.cleanupTimeout);
    instance.cleanupTimeout = null;
  }
  if (instance?.sock) {
    try {
      await instance.sock.end(undefined);
      console.log(`✅ [${commerceId}] Socket cerrado`);
    } catch (error) {
      console.warn(`⚠️ [${commerceId}] Error al cerrar socket:`, error);
    }
  }
  activeSessions.delete(commerceId);
  pairingCodes.delete(commerceId);
  if (deleteState) {
    const sessionPath = path.join(CONFIG.STATE_DIR, commerceId);
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`✅ [${commerceId}] Directorio de estado eliminado: ${sessionPath}`);
      } catch (error) {
        console.warn(`⚠️ [${commerceId}] Error eliminando directorio:`, error);
      }
    }
  }
  await sleep(CONFIG.SESSION_CLEANUP_DELAY_MS);
  console.log(`✅ [${commerceId}] Limpieza completada`);
}

// ============================================
// 11. UTILIDADES
// ============================================
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 12. EXPORTACIONES
// ============================================
export function getPairingCode(commerceId: string): string | undefined {
  return pairingCodes.get(commerceId);
}

export function getSessionStatus(commerceId: string): {
  exists: boolean;
  isPairing: boolean;
  hasCode: boolean;
  createdAt: Date | null;
} {
  const instance = activeSessions.get(commerceId);
  return {
    exists: !!instance,
    isPairing: instance?.isPairing || false,
    hasCode: pairingCodes.has(commerceId),
    createdAt: instance?.createdAt || null
  };
}

export function detectCodeType(code: string): 'pairing' | 'qr' | 'unknown' {
  if (!code) return 'unknown';
  if (code.startsWith('https://wa.me/settings/linked_devices') ||
      code.includes('wa.me') ||
      code.length > 500) return 'pairing';
  if (code.length < 500 && !code.startsWith('http')) return 'qr';
  return 'unknown';
}

export function formatPairingCode(code: string): string {
  if (code.startsWith('https://wa.me/')) return code;
  if (/^\d+$/.test(code)) return `https://wa.me/settings/linked_devices?pairing=${code}`;
  if (code.startsWith('http')) return code;
  return `https://wa.me/settings/linked_devices?code=${encodeURIComponent(code)}`;
}

export function getCodeWithType(commerceId: string): { code: string | null, type: 'pairing' | 'qr' | 'unknown' } {
  const code = pairingCodes.get(commerceId);
  if (!code) return { code: null, type: 'unknown' };
  const type = detectCodeType(code);
  return { code, type };
}

export function getFormattedCode(commerceId: string): string | null {
  const code = pairingCodes.get(commerceId);
  if (!code) return null;
  const type = detectCodeType(code);
  if (type === 'pairing') return formatPairingCode(code);
  return code;
}

export async function forceReconnect(commerceId: string, phoneNumber: string): Promise<string> {
  console.log(`🔄 [${commerceId}] Forzando reconexión...`);
  return await startWhatsAppBotForCommerce(commerceId, phoneNumber, true);
}