// ===== WEBSOCKET (Para Baileys) =====
import { WebSocket } from 'ws';
global.WebSocket = WebSocket;
// ===== IMPORTS =====
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import paymentRoutes from './routes/payment.routes.js';
import { FiscalInterceptor } from './features/fiscal/interceptor.js';
// ===== IMPORTS DE WHATSAPP (UN SOLO BLOQUE) =====
import { startWhatsAppBotForCommerce, pairingCodes, getSessionStatus } from './services/whatsapp.service.js';
// ===== DIRECTORIO ACTUAL =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log('🚀 Iniciando Senda API...');
const app = express();
// ===== PASO 1: ALMACÉN DE QRs EN MEMORIA =====
export const activeQrs = new Map();
// ===== MIDDLEWARE =====
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// ===== INTERCEPTOR FISCAL =====
const fiscalInterceptor = new FiscalInterceptor();
// ===== RUTAS DE PAGO =====
app.use('/api/payment', paymentRoutes);
// ===== STATIC FILES =====
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.redirect('/register.html'));
// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Senda API funcionando',
        timestamp: new Date().toISOString()
    });
});
// ===== INICIALIZAR MERCADO PAGO =====
let mercadopagoClient = null;
try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.warn('⚠️ MP_ACCESS_TOKEN no configurado');
    }
    else {
        mercadopagoClient = new MercadoPagoConfig({
            accessToken: accessToken
        });
        console.log('✅ MercadoPago inicializado');
    }
}
catch (error) {
    console.error('❌ Error MercadoPago:', error);
}
// ===== INICIALIZAR SUPABASE =====
let supabase = null;
async function initSupabase() {
    try {
        const module = await import('./config/supabase.js');
        supabase = module.supabase;
        console.log('✅ Supabase inicializado');
        return true;
    }
    catch (error) {
        console.error('❌ Error Supabase:', error);
        return false;
    }
}
// ===== VALIDACIÓN DE CERTIFICADOS SAT =====
function validarSAT(cer, key, pass) {
    const errors = [];
    if (!cer || cer.length < 10)
        errors.push('El .cer es obligatorio y debe tener al menos 10 caracteres');
    if (!key || key.length < 10)
        errors.push('El .key es obligatorio y debe tener al menos 10 caracteres');
    if (!pass || pass.length < 2)
        errors.push('La contraseña es obligatoria');
    return { valid: errors.length === 0, errors };
}
// ===== RUTA DE REGISTRO =====
app.post('/api/commerce/register', async (req, res) => {
    try {
        console.log('📝 Registro de comercio');
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;
        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
            return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
        }
        console.log('🔍 Validando certificados SAT...');
        const satValidation = validarSAT(csd_cer_base64, csd_key_base64, csd_password);
        if (!satValidation.valid) {
            return res.status(400).json({ success: false, error: 'Certificados SAT inválidos', details: satValidation.errors });
        }
        if (!supabase) {
            await initSupabase();
            if (!supabase)
                return res.status(503).json({ success: false, error: 'Base de datos no disponible' });
        }
        if (!mercadopagoClient) {
            return res.status(503).json({ success: false, error: 'Servicio de pagos no disponible' });
        }
        console.log('💾 Guardando en Supabase...');
        const { data, error } = await supabase
            .from('commerce')
            .insert({
            rfc, business_name, tax_regime, zip_code, phone, email,
            csd_cer_base64, csd_key_base64, csd_password,
            is_active: false, is_premium: false, invoice_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .select()
            .single();
        if (error) {
            console.error('❌ Error Supabase:', error);
            return res.status(500).json({ success: false, error: 'Error al guardar en base de datos', details: error.message });
        }
        console.log('✅ Comercio registrado ID:', data.id);
        console.log('🔄 Generando preferencia de pago...');
        let initPoint = null;
        try {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const host = req.get('host') || 'localhost:8080';
            const baseUrl = `${protocol}://${host}`;
            const preference = new Preference(mercadopagoClient);
            const result = await preference.create({
                body: {
                    items: [{
                            id: 'senda_register_001',
                            title: 'Registro Senda - Facturación SAT',
                            description: 'Activación de cuenta Senda',
                            quantity: 1,
                            unit_price: 50.00,
                            currency_id: 'MXN'
                        }],
                    payer: { email: email, name: business_name },
                    external_reference: data.id.toString(),
                    back_urls: {
                        success: `${baseUrl}/payment/success?id=${data.id}`,
                        failure: `${baseUrl}/payment/failure`,
                        pending: `${baseUrl}/payment/pending`
                    },
                    notification_url: `${baseUrl}/api/payment/webhook`
                }
            });
            initPoint = result.init_point;
            console.log('✅ Preferencia creada:', result.id);
        }
        catch (mpError) {
            console.error('❌ Error MercadoPago:', mpError);
            return res.status(500).json({ success: false, error: 'No se pudo generar el link de pago', details: mpError.message });
        }
        return res.json({
            success: true,
            message: '✅ Registro exitoso. Procede al pago.',
            init_point: initPoint,
            commerce: { id: data.id, business_name: data.business_name, email: data.email, phone: data.phone }
        });
    }
    catch (error) {
        console.error('❌ Error general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});
// ===== WEBHOOK DE MERCADO PAGO =====
app.post('/api/payment/webhook', async (req, res) => {
    try {
        console.log('📡 Webhook recibido');
        const { type, data, action } = req.body;
        if (type === 'payment' || action === 'payment.updated') {
            const paymentId = data?.id || req.body.id;
            if (!paymentId || !mercadopagoClient)
                return res.status(200).json({ received: true });
            const payment = new Payment(mercadopagoClient);
            const paymentInfo = await payment.get({ id: paymentId });
            console.log(`💰 Pago ${paymentId}: ${paymentInfo.status}`);
            if (paymentInfo.status === 'approved' && supabase) {
                const commerceId = paymentInfo.external_reference;
                if (commerceId) {
                    await supabase
                        .from('commerce')
                        .update({ is_active: true, is_premium: true, updated_at: new Date().toISOString() })
                        .eq('id', commerceId);
                    console.log(`✅ Pago aprobado para comercio ${commerceId}`);
                }
            }
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(200).json({ received: true });
    }
});
// ===== PASO 2: RUTA PARA OBTENER EL CÓDIGO DE 8 DÍGITOS REAL (BAILEY) =====
app.get('/api/whatsapp/get-pairing-code', async (req, res) => {
    try {
        const commerceId = req.query.id;
        if (!commerceId)
            return res.status(400).json({ success: false, error: 'Falta el ID del comercio' });
        if (!supabase)
            await initSupabase();
        const { data: commerce, error } = await supabase
            .from('commerce')
            .select('*')
            .eq('id', commerceId)
            .single();
        if (error || !commerce)
            return res.status(404).json({ success: false, error: 'Comercio no encontrado' });
        if (!commerce.is_active)
            return res.status(403).json({ success: false, error: 'El pago aún no ha sido confirmado' });
        // Buscamos si ya existe un código generado por Baileys en memoria
        let code = pairingCodes.get(commerceId);
        if (!code) {
            // Si no existe, inicializamos el bot de Baileys para este comercio de forma asíncrona
            console.log(`🔄 Iniciando bot de WhatsApp para generar código real para comercio: ${commerceId}`);
            startWhatsAppBotForCommerce(commerceId, commerce.phone).catch(err => {
                console.error(`❌ Error al iniciar bot de WhatsApp:`, err);
            });
            return res.json({
                success: false,
                message: 'Generando código real de WhatsApp, por favor espera unos segundos y recarga...'
            });
        }
        return res.json({
            success: true,
            message: 'Código generado con éxito',
            pairingCode: code
        });
    }
    catch (error) {
        console.error('❌ Error al obtener código de emparejamiento:', error);
        return res.status(500).json({ success: false, error: 'Error interno al generar el código' });
    }
});
// ===== RUTA AÑADIDA PARA CONSULTAR EL QR DESDE EL NAVEGADOR =====
app.get('/api/whatsapp/qr/:commerceId', (req, res) => {
    const { commerceId } = req.params;
    const qrData = activeQrs.get(commerceId);
    if (!qrData) {
        return res.status(404).send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2>⏳ QR no disponible aún</h2>
                <p>El código QR para el comercio <b>${commerceId}</b> todavía se está generando o ya fue vinculado.</p>
                <p>Revisa la consola de tu servidor (PowerShell) para ver el texto actual.</p>
            </body>
            </html>
        `);
    }
    res.send(`
        <html>
        <head><title>QR WhatsApp - Senda</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>📱 Código QR para Vincular WhatsApp</h2>
            <p>Comercio ID: <b>${commerceId}</b></p>
            <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; word-break: break-all; max-width: 600px; margin: 0 auto;">
                <code>${qrData}</code>
            </div>
            <p style="margin-top: 20px; color: #666;">Copia este texto o usa un generador de QR online si tu consola lo requiere.</p>
        </body>
        </html>
    `);
});
// ===== RUTA: OBTENER QR O PAIRING CODE PARA LA VISTA =====
app.get('/api/whatsapp/get-qr', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }
        console.log(`📡 [${id}] Consultando QR desde la vista...`);
        console.log(`📡 [${id}] pairingCodes.size: ${pairingCodes.size}`);
        console.log(`📡 [${id}] Claves:`, Array.from(pairingCodes.keys()));
        // Obtener el código directamente del Map
        const code = pairingCodes.get(id) || null;
        console.log(`📡 [${id}] Código encontrado: ${code ? 'SÍ' : 'NO'}`);
        // Si tenemos código QR
        if (code) {
            // 👇 ENVIAR EL TEXTO COMO QR (el frontend lo convierte a imagen)
            console.log(`✅ [${id}] Enviando QR texto real de Baileys (frontend lo mostrará como imagen)`);
            return res.json({
                success: true,
                qr: code,
                type: 'qr',
                status: 'pending',
                isPairing: false
            });
        }
        const status = getSessionStatus(id);
        // Si ya está conectado
        if (status.exists && !status.isPairing) {
            return res.json({
                success: true,
                status: 'connected',
                message: 'WhatsApp ya está conectado'
            });
        }
        // Si está en proceso de emparejamiento
        if (status.isPairing) {
            return res.json({
                success: true,
                status: 'pairing',
                message: 'Generando código de vinculación...'
            });
        }
        // Sin QR aún
        return res.json({
            success: true,
            status: 'waiting',
            message: 'Esperando generación del código...'
        });
    }
    catch (error) {
        console.error('❌ Error en GET /api/whatsapp/get-qr:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});
// ============================================
// ===== PÁGINA DE PAGO EXITOSO (MEJORADA CON INICIO AUTOMÁTICO) =====
// ============================================
app.get('/payment/success', async (req, res) => {
    const commerceId = req.query.id;
    // 👇 FORZAR LA GENERACIÓN DEL QR AUTOMÁTICAMENTE
    if (commerceId) {
        console.log(`🚀 [${commerceId}] Iniciando WhatsApp automáticamente desde /payment/success`);
        // Obtener el teléfono del comercio desde Supabase
        let phoneNumber = '5247654321'; // Número por defecto
        try {
            const module = await import('./config/supabase.js');
            const supabase = module.supabase;
            if (supabase) {
                const { data: commerce } = await supabase
                    .from('commerce')
                    .select('phone')
                    .eq('id', commerceId)
                    .single();
                if (commerce?.phone) {
                    phoneNumber = commerce.phone;
                }
            }
        }
        catch (e) {
            console.warn('⚠️ No se pudo obtener el teléfono, usando número por defecto');
        }
        // Iniciar el bot de WhatsApp (esto generará el QR)
        startWhatsAppBotForCommerce(commerceId, phoneNumber).catch(err => {
            console.error(`❌ Error al iniciar WhatsApp:`, err);
        });
    }
    // Mostrar la vista HTML
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vincular WhatsApp - Senda</title>
            <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f5f7fa;
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }

                .card {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
                    max-width: 550px;
                    width: 100%;
                    padding: 32px 28px;
                }

                .card h1 {
                    font-size: 24px;
                    font-weight: 600;
                    color: #1a1a2e;
                    text-align: center;
                    margin-bottom: 8px;
                }

                .card .subtitle {
                    text-align: center;
                    color: #6b7280;
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                .qr-container {
                    background: #f8fafc;
                    border-radius: 12px;
                    border: 2px dashed #d1d5db;
                    padding: 20px 16px;
                    min-height: 200px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    transition: border-color 0.3s ease;
                    margin-bottom: 16px;
                }

                .qr-container.loading {
                    border-color: #60a5fa;
                    background: #eff6ff;
                }

                .qr-container.ready {
                    border-color: #34d399;
                    background: #f0fdf4;
                }

                .qr-container.error {
                    border-color: #ef4444;
                    background: #fef2f2;
                }

                .qr-text {
                    width: 100%;
                    max-height: 180px;
                    overflow-y: auto;
                    padding: 12px;
                    font-family: 'Courier New', monospace;
                    font-size: 13px;
                    line-height: 1.6;
                    color: #1e293b;
                    background: #ffffff;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    word-break: break-all;
                    overflow-wrap: break-word;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }

                .qr-text::-webkit-scrollbar {
                    width: 6px;
                }

                .qr-text::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 10px;
                }

                .qr-text::-webkit-scrollbar-thumb {
                    background: #94a3b8;
                    border-radius: 10px;
                }

                .qr-image {
                    max-width: 200px;
                    height: auto;
                    display: block;
                    margin: 0 auto;
                }

                .spinner {
                    display: inline-block;
                    width: 32px;
                    height: 32px;
                    border: 3px solid #e2e8f0;
                    border-radius: 50%;
                    border-top-color: #3b82f6;
                    animation: spin 0.8s linear infinite;
                    margin-bottom: 12px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .placeholder-text {
                    color: #94a3b8;
                    font-size: 14px;
                    text-align: center;
                }

                .badge {
                    display: inline-block;
                    padding: 4px 14px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                    margin-top: 8px;
                }

                .badge.loading {
                    background: #dbeafe;
                    color: #1d4ed8;
                }

                .badge.ready {
                    background: #d1fae5;
                    color: #065f46;
                }

                .badge.error {
                    background: #fee2e2;
                    color: #991b1b;
                }

                .badge.success {
                    background: #d1fae5;
                    color: #065f46;
                }

                .btn {
                    display: inline-block;
                    padding: 12px 24px;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 14px;
                    border: none;
                    cursor: pointer;
                    text-decoration: none;
                    text-align: center;
                    transition: all 0.2s ease;
                    width: 100%;
                }

                .btn-primary {
                    background: #25D366;
                    color: white;
                }

                .btn-primary:hover {
                    background: #1ebe5a;
                }

                .btn-secondary {
                    background: #f1f5f9;
                    color: #334155;
                }

                .btn-secondary:hover {
                    background: #e2e8f0;
                }

                .btn-group {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 16px;
                }

                .error-msg {
                    color: #dc2626;
                    background: #fef2f2;
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-size: 14px;
                    margin-top: 12px;
                    display: none;
                }

                .error-msg.visible {
                    display: block;
                }

                .timeout-warning {
                    color: #d97706;
                    background: #fffbeb;
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    text-align: center;
                    margin-top: 8px;
                    display: none;
                }

                .timeout-warning.visible {
                    display: block;
                }

                .copy-btn {
                    margin-top: 10px;
                    padding: 8px 16px;
                    background: #e2e8f0;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: background 0.2s;
                }

                .copy-btn:hover {
                    background: #cbd5e1;
                }

                .hidden {
                    display: none !important;
                }

                #qrCodeContainer {
                    display: flex;
                    justify-content: center;
                    padding: 10px;
                }
                #qrCodeContainer img {
                    max-width: 200px;
                    height: auto;
                }

                @media (max-width: 640px) {
                    .card {
                        padding: 20px 16px;
                    }
                    .qr-text {
                        font-size: 12px;
                        max-height: 140px;
                    }
                    #qrCodeContainer img {
                        max-width: 160px;
                    }
                }
            </style>
        </head>
        <body>

        <div class="card">
            <h1>📱 Vincula tu WhatsApp</h1>
            <p class="subtitle">Escanea el código QR o abre el enlace para conectar tu cuenta</p>

            <div class="qr-container loading" id="qrContainer">
                <div id="qrContent">
                    <div class="placeholder-text">
                        <div class="spinner"></div>
                        <p>Generando código de vinculación...</p>
                        <p style="font-size:12px; color:#94a3b8; margin-top:8px;">Esperando respuesta del servidor...</p>
                    </div>
                </div>
                <span class="badge loading" id="statusBadge">⏳ Conectando...</span>
            </div>

            <div id="timeoutWarning" class="timeout-warning">
                ⚠️ La generación está tomando más tiempo de lo esperado.
                <br>Puedes <a href="#" id="refreshLink">intentar nuevamente</a>.
            </div>

            <div id="errorMsg" class="error-msg">
                ❌ Ocurrió un error al obtener el código.
            </div>

            <div class="btn-group">
                <a href="#" id="openWhatsAppBtn" class="btn btn-primary hidden">
                    📲 Abrir en WhatsApp
                </a>
                <button id="refreshBtn" class="btn btn-secondary">🔄 Reintentar</button>
                <a href="/register.html" class="btn btn-secondary" style="text-align:center;">Ir al inicio</a>
            </div>
        </div>

        <script>
            const COMERCIO_ID = new URLSearchParams(window.location.search).get('id');
            const API_BASE = '/api/whatsapp';
            const POLL_INTERVAL = 3000;
            const MAX_POLLS = 60;
            const TIMEOUT_WARNING = 20000;

            if (!COMERCIO_ID) {
                document.getElementById('errorMsg').textContent = '❌ ID de comercio no proporcionado';
                document.getElementById('errorMsg').classList.add('visible');
                throw new Error('ID de comercio requerido');
            }

            const qrContainer = document.getElementById('qrContainer');
            const qrContent = document.getElementById('qrContent');
            const statusBadge = document.getElementById('statusBadge');
            const errorMsg = document.getElementById('errorMsg');
            const timeoutWarning = document.getElementById('timeoutWarning');
            const openWhatsAppBtn = document.getElementById('openWhatsAppBtn');
            const refreshBtn = document.getElementById('refreshBtn');
            const refreshLink = document.getElementById('refreshLink');

            let pollTimer = null;
            let timeoutTimer = null;
            let pollCount = 0;

            function updateStatus(text, type = 'loading') {
                statusBadge.textContent = text;
                statusBadge.className = 'badge ' + type;
            }

            function showError(text) {
                errorMsg.textContent = text || 'Error al obtener el código. Intenta nuevamente.';
                errorMsg.classList.add('visible');
                updateStatus('Error', 'error');
                qrContainer.className = 'qr-container error';
            }

            function hideError() {
                errorMsg.classList.remove('visible');
            }

            function showLoading() {
                qrContainer.className = 'qr-container loading';
                qrContent.innerHTML = \`
                    <div class="placeholder-text">
                        <div class="spinner"></div>
                        <p>Generando código de vinculación...</p>
                        <p style="font-size:12px; color:#94a3b8; margin-top:8px;">Esperando respuesta del servidor...</p>
                    </div>
                \`;
                openWhatsAppBtn.classList.add('hidden');
                updateStatus('⏳ Conectando...', 'loading');
                hideError();
                timeoutWarning.classList.remove('visible');
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            function renderQR(qrData, type = 'qr') {
                hideError();
                qrContainer.className = 'qr-container ready';

                if (type === 'pairing') {
                    qrContent.innerHTML = \`
                        <div style="width:100%;">
                            <p style="font-size:13px; color:#64748b; margin-bottom:8px; text-align:center;">
                                🔗 Enlace de vinculación (abre en WhatsApp):
                            </p>
                            <div class="qr-text">\${escapeHtml(qrData)}</div>
                            <button class="copy-btn" id="copyPairingBtn">📋 Copiar enlace</button>
                        </div>
                    \`;

                    openWhatsAppBtn.classList.remove('hidden');
                    openWhatsAppBtn.href = qrData;
                    openWhatsAppBtn.target = '_blank';

                    document.getElementById('copyPairingBtn')?.addEventListener('click', () => {
                        navigator.clipboard.writeText(qrData).then(() => {
                            const btn = document.getElementById('copyPairingBtn');
                            btn.textContent = '✅ ¡Copiado!';
                            setTimeout(() => { btn.textContent = '📋 Copiar enlace'; }, 2000);
                        }).catch(() => {
                            const textEl = document.querySelector('.qr-text');
                            const range = document.createRange();
                            range.selectNode(textEl);
                            window.getSelection().removeAllRanges();
                            window.getSelection().addRange(range);
                            document.execCommand('copy');
                        });
                    });

                    updateStatus('✅ Enlace generado', 'success');

                } else {
                    // 👇 QR REAL DE BAILEYS - Generar imagen en el frontend
                    qrContent.innerHTML = \`
                        <div id="qrCodeContainer" style="display: flex; justify-content: center; padding: 10px;"></div>
                        <p style="font-size:13px; color:#64748b; margin-top:12px; text-align:center;">
                            📱 Escanea este código QR con WhatsApp desde tu teléfono
                        </p>
                        <p style="font-size:12px; color:#94a3b8; text-align:center;">
                            El código se vinculará automáticamente con Senda
                        </p>
                    \`;
                    
                    try {
                        new QRCode(document.getElementById('qrCodeContainer'), {
                            text: qrData,
                            width: 200,
                            height: 200,
                            colorDark: "#1a1a2e",
                            colorLight: "#ffffff",
                            correctLevel: QRCode.CorrectLevel.H
                        });
                    } catch (err) {
                        console.error('Error generando QR:', err);
                        qrContent.innerHTML = \`<div class="qr-text">\${escapeHtml(qrData)}</div>\`;
                    }
                    
                    openWhatsAppBtn.classList.add('hidden');
                    updateStatus('✅ QR listo para escanear', 'success');
                }

                qrContainer.className = 'qr-container ready';
            }

            function pollQR() {
                pollCount++;
                console.log('[Poll #' + pollCount + '] Consultando QR para: ' + COMERCIO_ID);

                fetch(API_BASE + '/get-qr?id=' + COMERCIO_ID)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('HTTP ' + response.status);
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('📥 Respuesta:', data);

                        if (data.success && data.status === 'connected') {
                            qrContent.innerHTML = \`
                                <div style="text-align:center; padding:20px;">
                                    <span style="font-size:48px;">✅</span>
                                    <p style="font-size:18px; font-weight:600; color:#065f46; margin-top:12px;">
                                        ¡WhatsApp vinculado!
                                    </p>
                                    <p style="color:#6b7280; font-size:14px;">
                                        Tu cuenta ya está conectada exitosamente.
                                    </p>
                                </div>
                            \`;
                            qrContainer.className = 'qr-container ready';
                            updateStatus('✅ Conectado', 'success');
                            openWhatsAppBtn.classList.add('hidden');
                            stopPolling();
                            return;
                        }

                        if (data.success && data.qr) {
                            renderQR(data.qr, data.type || 'qr');
                            stopPolling();
                            return;
                        }

                        if (pollCount >= MAX_POLLS) {
                            showError('Tiempo de espera agotado. El código no se generó a tiempo.');
                            stopPolling();
                            return;
                        }

                        pollTimer = setTimeout(pollQR, POLL_INTERVAL);
                    })
                    .catch(err => {
                        console.error('Error en polling:', err);
                        if (pollCount >= MAX_POLLS) {
                            showError('Error al comunicarse con el servidor.');
                            stopPolling();
                        } else {
                            const backoff = Math.min(POLL_INTERVAL * 1.5, 5000);
                            pollTimer = setTimeout(pollQR, backoff);
                        }
                    });
            }

            function stopPolling() {
                if (pollTimer) {
                    clearTimeout(pollTimer);
                    pollTimer = null;
                }
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                }
            }

            function startPolling() {
                stopPolling();
                pollCount = 0;
                showLoading();
                hideError();
                timeoutWarning.classList.remove('visible');

                timeoutTimer = setTimeout(() => {
                    timeoutWarning.classList.add('visible');
                }, TIMEOUT_WARNING);

                pollTimer = setTimeout(pollQR, 1000);
            }

            refreshBtn.addEventListener('click', startPolling);
            refreshLink.addEventListener('click', (e) => {
                e.preventDefault();
                startPolling();
            });

            console.log('🚀 Iniciando vinculación para comercio:', COMERCIO_ID);
            startPolling();

            window.addEventListener('beforeunload', stopPolling);
        </script>

        </body>
        </html>
    `);
});
app.get('/payment/failure', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Pago Fallido</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: red;">❌ Pago Fallido</h1>
            <p>Hubo un problema con tu pago. Intenta nuevamente.</p>
            <a href="/register.html">Volver al inicio</a>
        </body>
        </html>
    `);
});
app.get('/payment/pending', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Pago Pendiente</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: orange;">⏳ Pago Pendiente</h1>
            <p>Tu pago está siendo procesado.</p>
            <a href="/register.html">Volver al inicio</a>
        </body>
        </html>
    `);
});
// ===== WEBHOOK DE WHATSAPP CON INTERCEPTOR FISCAL =====
app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const { message, userId } = req.body;
        console.log(`📨 Mensaje de WhatsApp de ${userId}: ${message?.substring(0, 50)}...`);
        const fiscalResponse = await fiscalInterceptor.intercept(message, userId);
        if (fiscalResponse) {
            return res.json({ success: true, response: fiscalResponse, flow: 'fiscal' });
        }
        return res.json({ success: true, response: 'Hola, ¿cómo puedo ayudarte?', flow: 'default' });
    }
    catch (error) {
        console.error('❌ Error en webhook de WhatsApp:', error);
        return res.status(500).json({ success: false, error: 'Error procesando mensaje' });
    }
});
// ============================================
// ENDPOINTS DE WHATSAPP
// ============================================
app.post('/api/whatsapp/pair', async (req, res) => {
    const { commerceId, phoneNumber } = req.body;
    if (!commerceId || !phoneNumber) {
        return res.status(400).json({
            error: 'Faltan campos requeridos',
            required: ['commerceId', 'phoneNumber']
        });
    }
    try {
        console.log(`📱 Recibida petición de emparejamiento para comercio: ${commerceId}`);
        const code = await startWhatsAppBotForCommerce(commerceId, phoneNumber);
        res.json({
            success: true,
            data: {
                code,
                commerceId,
                phoneNumber
            }
        });
    }
    catch (error) {
        console.error('❌ Error en emparejamiento:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        });
    }
});
app.get('/api/whatsapp/status/:commerceId', async (req, res) => {
    const { commerceId } = req.params;
    try {
        const status = getSessionStatus(commerceId);
        res.json({
            success: true,
            data: status
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
        });
    }
});
// ============================================
// INICIO AUTOMÁTICO DEL SERVIDOR
// ============================================
const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 Senda API corriendo en puerto ${PORT}`);
    console.log(`🌐 Health: http://localhost:${PORT}/health`);
    console.log(`📋 Registro: http://localhost:${PORT}/register.html`);
    console.log('========================================');
    initSupabase().catch(err => console.error('❌ Error en initSupabase async:', err));
});
export default app;
