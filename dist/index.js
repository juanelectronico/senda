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
import { supabase } from './config/supabase.js';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
// ===== IMPORTS DE WHATSAPP =====
import { startWhatsAppBotForCommerce, pairingCodes, getSessionStatus } from './services/whatsapp.service.js';
// ===== DIRECTORIO ACTUAL =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log('🚀 Iniciando Senda API...');
const app = express();
app.set('trust proxy', 1);
// ===== MIDDLEWARE =====
app.use(morgan('combined'));
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// ===== RATE LIMITING =====
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos, espera 15 minutos' }
});
// ===== INTERCEPTOR FISCAL =====
const fiscalInterceptor = new FiscalInterceptor();
// ===== RUTAS DE PAGO =====
app.use('/api/payment', paymentRoutes);
// ===== STATIC FILES =====
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir, {
    index: false
}));
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'registro-comercio.html'));
});
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
    if (accessToken) {
        mercadopagoClient = new MercadoPagoConfig({ accessToken: accessToken });
        console.log('✅ MercadoPago inicializado');
    }
}
catch (error) {
    console.error('❌ Error MercadoPago:', error);
}
// ===== VALIDACIÓN DE CERTIFICADOS SAT =====
function validarSAT(cer, key, pass) {
    const errors = [];
    if (cer.length < 100 || key.length < 100 || pass.length < 4)
        errors.push('Datos inválidos');
    return { valid: errors.length === 0, errors };
}
// ===== RUTA DE REGISTRO =====
app.post('/api/commerce/register', registerLimiter, async (req, res) => {
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;
        const { data, error } = await supabase
            .from('commerce')
            .insert({ rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password, is_active: false })
            .select()
            .single();
        if (error)
            return res.status(500).json({ success: false, error: 'Error BD' });
        const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.get('host')}`;
        const preference = new Preference(mercadopagoClient);
        const result = await preference.create({
            body: {
                items: [{
                        id: 'senda_register',
                        title: 'Registro Senda',
                        quantity: 1,
                        unit_price: 50.00,
                        currency_id: 'MXN'
                    }],
                external_reference: data.id.toString(),
                back_urls: { success: `${baseUrl}/payment/success?id=${data.id}` }
            }
        });
        return res.json({ success: true, init_point: result.init_point, commerceId: data.id });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});
// ===== WEBHOOK DE MERCADO PAGO =====
app.post('/api/payment/webhook', async (req, res) => {
    try {
        const { data, action } = req.body;
        if (action === 'payment.updated' || req.body.type === 'payment') {
            const paymentId = data?.id || req.body.id;
            const paymentInfo = await new Payment(mercadopagoClient).get({ id: paymentId });
            if (paymentInfo.status === 'approved') {
                await supabase.from('commerce').update({ is_active: true }).eq('id', paymentInfo.external_reference);
            }
        }
        res.status(200).json({ received: true });
    }
    catch (e) {
        res.status(500).json({ received: false });
    }
});
// ===== RUTA: OBTENER QR =====
app.get('/api/whatsapp/get-qr', async (req, res) => {
    const { id } = req.query;
    const rawCode = pairingCodes.get(id);
    if (rawCode)
        return res.json({ success: true, qr: rawCode, status: 'ready' });
    const status = getSessionStatus(id);
    return res.json({ success: true, status: status.isPairing ? 'pairing' : 'waiting' });
});
// ===== PÁGINA DE PAGO EXITOSO (CORREGIDA) =====
app.get('/payment/success', async (req, res) => {
    const commerceId = req.query.id;
    if (!commerceId)
        return res.status(400).send('ID faltante');
    (async () => {
        const { data: commerce } = await supabase.from('commerce').select('phone').eq('id', commerceId).single();
        if (commerce?.phone)
            await startWhatsAppBotForCommerce(commerceId, commerce.phone, true);
    })();
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8"><title>Vinculación Senda</title>
            <style>
                body { background: #0f172a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .card { background: #1e293b; padding: 40px; border-radius: 20px; text-align: center; max-width: 400px; width: 90%; }
                .code { font-family: monospace; font-size: 40px; letter-spacing: 8px; color: #38bdf8; background: #000; padding: 20px; border-radius: 10px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>✅ Pago Confirmado</h1>
                <p>Tu código de 8 dígitos para WhatsApp es:</p>
                <div class="code" id="codeDisplay">...</div>
                <p id="status">⏳ Iniciando bot...</p>
            </div>
            <script>
                const id = new URLSearchParams(window.location.search).get('id');
                setInterval(async () => {
                    const res = await fetch('/api/whatsapp/get-qr?id=' + id);
                    const data = await res.json();
                    if(data.qr) { document.getElementById('codeDisplay').textContent = data.qr; document.getElementById('status').textContent = '✅ Ingresa este código en WhatsApp'; }
                    else if(data.status === 'connected') { document.getElementById('codeDisplay').textContent = 'LISTO'; document.getElementById('status').textContent = '✅ Vinculado exitosamente'; }
                }, 3000);
            </script>
        </body>
        </html>
    `);
});
const PORT = process.env.PORT || 8080;
app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 Senda API en puerto ${PORT}`));
