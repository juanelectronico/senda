// ===== WEBSOCKET (Para Baileys) =====
import { WebSocket } from 'ws';
(global as any).WebSocket = WebSocket;

// ===== IMPORTS =====
import 'dotenv/config';
import express, { Request, Response } from 'express';
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
import { 
    startWhatsAppBotForCommerce, 
    pairingCodes, 
    getSessionStatus 
} from './services/whatsapp.service.js';

// ===== DIRECTORIO ACTUAL =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Iniciando Senda API...');

const app = express();

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

// ===== STATIC FILES (Orden correcto después de declarar 'app') =====
const publicDir = path.resolve(process.cwd(), 'public'); 
app.use(express.static(publicDir, {
    index: false 
}));

// Redirección explícita al nombre correcto de tu archivo HTML
app.get('/', (req: Request, res: Response) => {
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
let mercadopagoClient: MercadoPagoConfig | null = null;

try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        console.warn('⚠️ MP_ACCESS_TOKEN no configurado');
    } else {
        mercadopagoClient = new MercadoPagoConfig({
            accessToken: accessToken
        });
        console.log('✅ MercadoPago inicializado');
    }
} catch (error) {
    console.error('❌ Error MercadoPago:', error);
}

// ===== VALIDACIÓN DE CERTIFICADOS SAT =====
function validarSAT(cer: string, key: string, pass: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    if (!base64Regex.test(cer)) errors.push('El .cer no tiene formato Base64 válido');
    if (!base64Regex.test(key)) errors.push('El .key no tiene formato Base64 válido');
    if (cer.length < 100) errors.push('El .cer parece demasiado corto');
    if (key.length < 100) errors.push('El .key parece demasiado corto');
    if (pass.length < 4) errors.push('La contraseña debe tener al menos 4 caracteres');
    return { valid: errors.length === 0, errors };
}

// ===== RUTA DE REGISTRO =====
app.post('/api/commerce/register', registerLimiter, async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('📝 Registro de comercio');
        const { 
            rfc, business_name, tax_regime, zip_code, phone, email,
            csd_cer_base64, csd_key_base64, csd_password 
        } = req.body;

        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
            return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
        }

        const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
        if (!rfcRegex.test(rfc)) {
            return res.status(400).json({ success: false, error: 'RFC inválido. Formato esperado: ABC123456DEF' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, error: 'Email inválido' });
        }

        const satValidation = validarSAT(csd_cer_base64, csd_key_base64, csd_password);
        if (!satValidation.valid) {
            return res.status(400).json({ success: false, error: 'Certificados SAT inválidos', details: satValidation.errors });
        }

        if (!supabase || !mercadopagoClient) {
            return res.status(503).json({ success: false, error: 'Servicios de base de datos o pagos no disponibles' });
        }

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
            return res.status(500).json({ success: false, error: 'Error al guardar en base de datos', details: error.message });
        }

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

        return res.json({
            success: true,
            message: '✅ Registro exitoso. Procede al pago.',
            init_point: result.init_point,
            commerceId: data.id, // <-- Importante para que el frontend redirija correctamente
            commerce: { id: data.id, business_name: data.business_name, email: data.email, phone: data.phone }
        });

    } catch (error: any) {
        console.error('❌ Error general:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// ===== WEBHOOK DE MERCADO PAGO =====
app.post('/api/payment/webhook', async (req: Request, res: Response): Promise<any> => {
    try {
        const { type, data, action } = req.body;
        if (type === 'payment' || action === 'payment.updated') {
            const paymentId = data?.id || req.body.id;
            if (paymentId && mercadopagoClient && supabase) {
                const payment = new Payment(mercadopagoClient);
                const paymentInfo = await payment.get({ id: paymentId });
                if (paymentInfo.status === 'approved') {
                    const commerceId = paymentInfo.external_reference;
                    if (commerceId) {
                        await supabase
                            .from('commerce')
                            .update({ is_active: true, is_premium: true, updated_at: new Date().toISOString() })
                            .eq('id', commerceId);
                    }
                }
            }
        }
        res.status(200).json({ received: true });
    } catch (error) {
        res.status(500).json({ received: false, error: 'Error procesando webhook' });
    }
});

// ===== RUTA: OBTENER QR =====
app.get('/api/whatsapp/get-qr', async (req: Request, res: Response) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'ID de comercio es requerido' });
        }

        if (supabase) {
            const { data: commerce, error } = await supabase
                .from('commerce')
                .select('is_active, phone')
                .eq('id', id)
                .single();

            if (error || !commerce || !commerce.is_active) {
                return res.status(403).json({ success: false, error: 'Comercio no activo o no encontrado' });
            }
        }

        const rawCode = pairingCodes.get(id) || null;
        if (rawCode) {
            return res.json({ success: true, qr: rawCode, status: 'ready', isPairing: false });
        }

        const status = getSessionStatus(id);
        if (status.exists && !status.isPairing) {
            return res.json({ success: true, status: 'connected', message: 'WhatsApp ya está conectado' });
        }

        return res.json({ success: true, status: status.isPairing ? 'pairing' : 'waiting', message: 'Procesando QR...' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// ===== PÁGINA DE PAGO EXITOSO =====
app.get('/payment/success', async (req, res) => {
    const commerceId = req.query.id as string;
    
    if (!commerceId) return res.status(400).send('ID de comercio no proporcionado');

    try {
        if (supabase) {
            const { data: commerce } = await supabase
                .from('commerce')
                .select('phone')
                .eq('id', commerceId)
                .single();

            if (commerce?.phone) {
                startWhatsAppBotForCommerce(commerceId, commerce.phone, true).catch(() => {});
            }
        }
    } catch (e) {}

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vincular WhatsApp - Senda</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
                .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3); max-width: 550px; width: 100%; padding: 32px 28px; }
                .card h1 { font-size: 24px; font-weight: 600; color: #38bdf8; text-align: center; margin-bottom: 8px; }
                .card .subtitle { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
                .qr-container { background: #0f172a; border-radius: 12px; border: 2px dashed #475569; padding: 20px 16px; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 16px; }
                .btn { display: inline-block; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; text-decoration: none; text-align: center; width: 100%; transition: background 0.2s; }
                .btn-secondary { background: #334155; color: #f8fafc; }
                .btn-secondary:hover { background: #475569; }
                .btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
                .badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; margin-top: 8px; }
                .badge.loading { background: #1e3a8a; color: #93c5fd; }
                .badge.ready { background: #064e3b; color: #6ee7b7; }
                .spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid #334155; border-radius: 50%; border-top-color: #38bdf8; animation: spin 0.8s linear infinite; margin-bottom: 12px; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .payment-badge { background: #064e3b; color: #6ee7b7; padding: 8px 16px; border-radius: 8px; text-align: center; margin-bottom: 16px; font-weight: 500; }
            </style>
        </head>
        <body>
        <div class="card">
            <h1>📱 Vincula tu WhatsApp</h1>
            <p class="subtitle">Escanea el código QR con la app de WhatsApp</p>
            <div class="payment-badge">✅ Pago confirmado. ¡Ya puedes conectar WhatsApp!</div>
            <div class="qr-container" id="qrContainer">
                <div id="qrContent">
                    <div class="spinner"></div>
                    <p style="text-align: center; color: #94a3b8;">Generando código QR...</p>
                </div>
                <span class="badge loading" id="statusBadge">⏳ Conectando...</span>
            </div>
            <div class="btn-group">
                <button id="refreshBtn" class="btn btn-secondary">🔄 Reintentar</button>
                <a href="/" class="btn btn-secondary">Ir al inicio</a>
            </div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <script>
            const COMERCIO_ID = new URLSearchParams(window.location.search).get('id');
            async function checkQR() {
                try {
                    const res = await fetch(\`/api/whatsapp/get-qr?id=\${COMERCIO_ID}\`);
                    const data = await res.json();
                    if (data.success && data.qr) {
                        const content = document.getElementById('qrContent');
                        const badge = document.getElementById('statusBadge');
                        content.innerHTML = '<canvas id="qrCanvas"></canvas>';
                        QRCode.toCanvas(document.getElementById('qrCanvas'), data.qr, { width: 220 }, function (error) {});
                        badge.textContent = '✅ Escanea este QR';
                        badge.className = 'badge ready';
                    } else if (data.status === 'connected') {
                        document.getElementById('qrContent').innerHTML = '<p style="color: #6ee7b7; font-weight: bold;">¡Vinculado con éxito!</p>';
                        document.getElementById('statusBadge').textContent = '✅ Conectado';
                        document.getElementById('statusBadge').className = 'badge ready';
                    }
                } catch (e) {}
            }
            setInterval(checkQR, 3000);
            document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
        </script>
        </body>
        </html>
    `);
});

// ===== PUERTO Y LANZAMIENTO =====
const PORT = process.env.PORT || 8080;
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Senda API ejecutándose en el puerto ${PORT}`);
});