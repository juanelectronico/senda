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
    if (accessToken) {
        mercadopagoClient = new MercadoPagoConfig({ accessToken: accessToken });
        console.log('✅ MercadoPago inicializado');
    }
} catch (error) {
    console.error('❌ Error MercadoPago:', error);
}

// ===== VALIDACIÓN DE CERTIFICADOS SAT =====
function validarSAT(cer: string, key: string, pass: string) {
    const errors: string[] = [];
    if (cer.length < 100 || key.length < 100 || pass.length < 4) errors.push('Datos inválidos');
    return { valid: errors.length === 0, errors };
}

// ===== RUTA DE REGISTRO =====
app.post('/api/commerce/register', registerLimiter, async (req: Request, res: Response): Promise<any> => {
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;
        
        const { data, error } = await supabase
            .from('commerce')
            .insert({ rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password, is_active: false })
            .select()
            .single();

        if (error) return res.status(500).json({ success: false, error: 'Error BD' });

        const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.get('host')}`;
        const preference = new Preference(mercadopagoClient as any);
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
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ===== WEBHOOK DE MERCADO PAGO =====
app.post('/api/payment/webhook', async (req: Request, res: Response): Promise<any> => {
    try {
        const { data, action } = req.body;
        if (action === 'payment.updated' || req.body.type === 'payment') {
            const paymentId = data?.id || req.body.id;
            const paymentInfo = await new Payment(mercadopagoClient as any).get({ id: paymentId });
            if (paymentInfo.status === 'approved') {
                await supabase.from('commerce').update({ is_active: true }).eq('id', paymentInfo.external_reference);
            }
        }
        res.status(200).json({ received: true });
    } catch (e) { res.status(500).json({ received: false }); }
});

// ===== RUTA: OBTENER QR (CON INICIO FORZADO) =====
app.get('/api/whatsapp/get-qr', async (req: Request, res: Response) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'ID requerido' });

    try {
        // 1. Verificar si ya hay un código
        const rawCode = pairingCodes.get(id as string);
        if (rawCode) {
            return res.json({ success: true, qr: rawCode, status: 'ready' });
        }
        
        // 2. Verificar estado de la sesión
        const status = getSessionStatus(id as string);
        if (status.exists && !status.isPairing) {
            return res.json({ success: true, status: 'connected' });
        }
        
        // 3. Si no hay código y no está conectado, FORZAR INICIO
        console.log(`🔄 [get-qr] Forzando inicio de bot para comercio ${id}`);
        
        // Obtener el teléfono desde Supabase
        const { data: commerce, error } = await supabase
            .from('commerce')
            .select('phone')
            .eq('id', id)
            .single();
        
        if (error) {
            console.error(`❌ [get-qr] Error en Supabase:`, error);
            return res.json({ success: true, status: 'waiting', message: 'Error obteniendo teléfono' });
        }
        
        if (!commerce?.phone) {
            console.error(`❌ [get-qr] No hay teléfono para comercio ${id}`);
            return res.json({ success: true, status: 'waiting', message: 'Comercio sin teléfono' });
        }
        
        console.log(`📱 [get-qr] Iniciando bot para ${id} con número ${commerce.phone}`);
        
        // Iniciar el bot y esperar el código
        const code = await startWhatsAppBotForCommerce(id as string, commerce.phone, true);
        
        if (code && code !== 'ALREADY_AUTHENTICATED') {
            return res.json({ success: true, qr: code, status: 'ready' });
        } else if (code === 'ALREADY_AUTHENTICATED') {
            return res.json({ success: true, status: 'connected' });
        } else {
            return res.json({ success: true, status: 'pairing', message: 'Generando código...' });
        }
    } catch (error) {
        console.error(`❌ [get-qr] Error:`, error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ===== PÁGINA DE PAGO EXITOSO (CORREGIDA) =====
app.get('/payment/success', async (req, res) => {
    const commerceId = req.query.id as string;
    if (!commerceId) return res.status(400).send('ID faltante');

    // Iniciar el bot en segundo plano
    (async () => {
        try {
            console.log(`🔵 [payment/success] Solicitado para comercio: ${commerceId}`);
            const { data: commerce, error } = await supabase
                .from('commerce')
                .select('phone')
                .eq('id', commerceId)
                .single();
            
            if (error) {
                console.error(`❌ [payment/success] Error en Supabase:`, error);
                return;
            }
            
            console.log(`📱 [payment/success] Comercio encontrado:`, commerce);
            
            if (commerce?.phone) {
                console.log(`🚀 [payment/success] Iniciando bot para ${commerceId} con número ${commerce.phone}`);
                const result = await startWhatsAppBotForCommerce(commerceId, commerce.phone, true);
                console.log(`✅ [payment/success] Bot iniciado, resultado:`, result);
            } else {
                console.log(`⚠️ [payment/success] No hay teléfono para comercio ${commerceId}`);
            }
        } catch (err) {
            console.error(`❌ [payment/success] Error iniciando bot:`, err);
        }
    })();

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vinculación Senda</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
                .card { background: #1e293b; padding: 40px; border-radius: 20px; text-align: center; max-width: 420px; width: 100%; border: 1px solid #334155; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
                h1 { color: #38bdf8; font-size: 24px; margin-bottom: 8px; }
                .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
                .code-container { background: #0f172a; padding: 24px; border-radius: 12px; margin: 20px 0; border: 2px solid #38bdf8; }
                .code { font-family: 'Courier New', monospace; font-size: 44px; letter-spacing: 8px; color: #38bdf8; font-weight: 700; min-height: 60px; }
                .status { margin: 16px 0; font-size: 14px; color: #94a3b8; min-height: 24px; }
                .spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #334155; border-radius: 50%; border-top-color: #38bdf8; animation: spin 0.8s linear infinite; margin: 0 auto 8px; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .payment-badge { background: #064e3b; color: #6ee7b7; padding: 8px 16px; border-radius: 8px; margin-bottom: 16px; font-weight: 500; }
                .instructions { color: #94a3b8; font-size: 13px; margin: 12px 0; line-height: 1.6; }
                .instructions strong { color: #f8fafc; }
                .copy-btn { margin-top: 8px; padding: 6px 20px; background: #334155; border: none; border-radius: 6px; color: #f8fafc; cursor: pointer; font-size: 12px; transition: background 0.2s; }
                .copy-btn:hover { background: #475569; }
                .btn-group { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
                .btn { padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; text-decoration: none; text-align: center; width: 100%; }
                .btn-secondary { background: #334155; color: #f8fafc; }
                .btn-secondary:hover { background: #475569; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="payment-badge">✅ Pago confirmado</div>
                <h1>📱 Vincula tu WhatsApp</h1>
                <p class="subtitle">Ingresa el código de 8 dígitos en la app</p>
                
                <div class="code-container">
                    <div class="code" id="codeDisplay">⏳</div>
                </div>
                
                <div id="statusContainer">
                    <div class="spinner" id="spinner"></div>
                    <div class="status" id="status">⏳ Generando código de vinculación...</div>
                </div>

                <div id="instructionsContainer" style="display: none;">
                    <p class="instructions">
                        📱 Abre WhatsApp y ve a:<br>
                        <strong>Ajustes → Dispositivos vinculados → Vincular un dispositivo</strong>
                    </p>
                    <button class="copy-btn" id="copyBtn">📋 Copiar código</button>
                </div>

                <div class="btn-group">
                    <button id="refreshBtn" class="btn btn-secondary">🔄 Reintentar</button>
                    <a href="/" class="btn btn-secondary">Ir al inicio</a>
                </div>
            </div>

            <script>
                const id = new URLSearchParams(window.location.search).get('id');
                let lastCode = '';

                function updateUI(data) {
                    const codeDisplay = document.getElementById('codeDisplay');
                    const statusEl = document.getElementById('status');
                    const spinner = document.getElementById('spinner');
                    const instructions = document.getElementById('instructionsContainer');
                    const copyBtn = document.getElementById('copyBtn');

                    instructions.style.display = 'none';
                    spinner.style.display = 'inline-block';

                    if (data.success && data.qr && data.status === 'ready') {
                        const code = data.qr;
                        if (/^\\d{8}$/.test(code)) {
                            codeDisplay.textContent = code;
                            statusEl.textContent = '🔢 Ingresa este código en WhatsApp (válido por 2 minutos)';
                            statusEl.style.color = '#38bdf8';
                            spinner.style.display = 'none';
                            instructions.style.display = 'block';
                            
                            copyBtn.onclick = () => {
                                navigator.clipboard.writeText(code);
                                copyBtn.textContent = '✅ ¡Copiado!';
                                setTimeout(() => copyBtn.textContent = '📋 Copiar código', 2000);
                            };
                            
                            lastCode = code;
                            return;
                        }
                    }

                    if (data.status === 'connected') {
                        codeDisplay.textContent = '✅';
                        statusEl.textContent = '✅ WhatsApp vinculado con éxito';
                        statusEl.style.color = '#4ade80';
                        spinner.style.display = 'none';
                        instructions.style.display = 'none';
                        return;
                    }

                    if (data.status === 'pairing') {
                        codeDisplay.textContent = '...';
                        statusEl.textContent = '⏳ Código generado, esperando confirmación en WhatsApp...';
                        statusEl.style.color = '#fcd34d';
                        spinner.style.display = 'inline-block';
                        return;
                    }

                    if (data.status === 'waiting' || !data.success) {
                        codeDisplay.textContent = '⏳';
                        statusEl.textContent = '⏳ Generando código de vinculación...';
                        statusEl.style.color = '#94a3b8';
                        spinner.style.display = 'inline-block';
                        instructions.style.display = 'none';
                        return;
                    }

                    codeDisplay.textContent = '?';
                    statusEl.textContent = '⏳ Procesando...';
                    statusEl.style.color = '#94a3b8';
                }

                async function checkStatus() {
                    try {
                        const res = await fetch('/api/whatsapp/get-qr?id=' + id);
                        const data = await res.json();
                        console.log('📡 Estado:', data);
                        updateUI(data);
                    } catch (e) {
                        console.error('❌ Error:', e);
                        document.getElementById('status').textContent = '❌ Error al conectar';
                        document.getElementById('spinner').style.display = 'none';
                    }
                }

                checkStatus();
                const interval = setInterval(checkStatus, 2000);

                document.getElementById('refreshBtn').addEventListener('click', () => {
                    window.location.reload();
                });

                window.addEventListener('beforeunload', () => clearInterval(interval));
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 8080;
app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 Senda API en puerto ${PORT}`));