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
// Importación correcta para MercadoPago en ESM
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

// ===== DIRECTORIO ACTUAL =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Iniciando Senda API...');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// ===== INICIALIZAR MERCADO PAGO (CORREGIDO) =====
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

// ===== INICIALIZAR SUPABASE =====
let supabase: any = null;

async function initSupabase() {
    try {
        const module = await import('./config/supabase.js');
        supabase = module.supabase;
        console.log('✅ Supabase inicializado');
        return true;
    } catch (error) {
        console.error('❌ Error Supabase:', error);
        return false;
    }
}

// ===== VALIDACIÓN DE CERTIFICADOS SAT =====
function validarSAT(cer: string, key: string, pass: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!cer || cer.length < 10) errors.push('El .cer es obligatorio y debe tener al menos 10 caracteres');
    if (!key || key.length < 10) errors.push('El .key es obligatorio y debe tener al menos 10 caracteres');
    if (!pass || pass.length < 2) errors.push('La contraseña es obligatoria');

    return { valid: errors.length === 0, errors };
}

// ===== RUTA DE REGISTRO =====
app.post('/api/commerce/register', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('📝 Registro de comercio');
        
        const { 
            rfc, business_name, tax_regime, zip_code, phone, email,
            csd_cer_base64, csd_key_base64, csd_password 
        } = req.body;

        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos obligatorios'
            });
        }

        console.log('🔍 Validando certificados SAT...');
        const satValidation = validarSAT(csd_cer_base64, csd_key_base64, csd_password);
        
        if (!satValidation.valid) {
            console.warn('❌ Error SAT:', satValidation.errors);
            return res.status(400).json({
                success: false,
                error: 'Certificados SAT inválidos',
                details: satValidation.errors
            });
        }
        console.log('✅ Certificados SAT válidos');

        if (!supabase) {
            await initSupabase();
            if (!supabase) {
                return res.status(503).json({
                    success: false,
                    error: 'Base de datos no disponible'
                });
            }
        }

        if (!mercadopagoClient) {
            return res.status(503).json({
                success: false,
                error: 'Servicio de pagos no disponible'
            });
        }

        console.log('💾 Guardando en Supabase...');
        const { data, error } = await supabase
            .from('commerce')
            .insert({
                rfc,
                business_name,
                tax_regime,
                zip_code,
                phone,
                email,
                csd_cer_base64,
                csd_key_base64,
                csd_password,
                is_active: false,
                is_premium: false,
                invoice_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Error Supabase:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al guardar en base de datos',
                details: error.message
            });
        }

        console.log('✅ Comercio registrado ID:', data.id);

        // ===== GENERAR PREFERENCIA DE PAGO (CORREGIDO) =====
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
                    payer: {
                        email: email,
                        name: business_name
                    },
                    external_reference: data.id.toString(),
                    back_urls: {
                        success: `${baseUrl}/payment/success`,
                        failure: `${baseUrl}/payment/failure`,
                        pending: `${baseUrl}/payment/pending`
                    },
                    notification_url: `${baseUrl}/api/payment/webhook`
                }
            });

            initPoint = result.init_point;
            
            console.log('✅ Preferencia creada:', result.id);
            console.log('🔗 Link de pago:', initPoint);

        } catch (mpError: any) {
            console.error('❌ Error MercadoPago:', mpError);

            return res.status(500).json({
                success: false,
                error: 'No se pudo generar el link de pago',
                details: mpError.message
            });
        }

        return res.json({
            success: true,
            message: '✅ Registro exitoso. Procede al pago.',
            init_point: initPoint,
            commerce: {
                id: data.id,
                business_name: data.business_name,
                email: data.email,
                phone: data.phone
            }
        });

    } catch (error: any) {
        console.error('❌ Error general:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// ===== WEBHOOK DE MERCADO PAGO (CORREGIDO) =====
app.post('/api/payment/webhook', async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('📡 Webhook recibido');
        
        const { type, data, action } = req.body;

        if (type === 'payment' || action === 'payment.updated') {
            const paymentId = data?.id || req.body.id;
            
            if (!paymentId) {
                return res.status(200).json({ received: true });
            }

            if (!mercadopagoClient) {
                console.error('❌ MercadoPago no inicializado');
                return res.status(200).json({ received: true });
            }

            // OBTENER PAGO CON LA NUEVA SINTAXIS
            const payment = new Payment(mercadopagoClient);
            const paymentInfo = await payment.get({ id: paymentId });

            console.log(`💰 Pago ${paymentId}: ${paymentInfo.status}`);

            if (paymentInfo.status === 'approved' && supabase) {
                const commerceId = paymentInfo.external_reference;
                
                if (commerceId) {
                    const { error } = await supabase
                        .from('commerce')
                        .update({
                            is_active: true,
                            is_premium: true,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', commerceId);
                    
                    if (error) {
                        console.error('❌ Error al actualizar comercio en webhook:', error);
                    } else {
                        console.log(`✅ Pago aprobado para comercio ${commerceId}`);
                    }
                }
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(200).json({ received: true });
    }
});

// ===== PÁGINAS DE PAGO =====
app.get('/payment/success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Pago Exitoso</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: green;">✅ Pago Exitoso</h1>
            <p>Tu cuenta ha sido activada correctamente.</p>
            <a href="/register.html">Volver al inicio</a>
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

// ===== FUNCIÓN PRINCIPAL =====
async function main() {
    await initSupabase();

    const PORT = parseInt(process.env.PORT || '8080', 10);

    app.listen(PORT, '0.0.0.0', () => {
        console.log('========================================');
        console.log(`🚀 Senda API corriendo en puerto ${PORT}`);
        console.log(`🌐 Health: http://localhost:${PORT}/health`);
        console.log(`📋 Registro: http://localhost:${PORT}/register.html`);
        console.log('========================================');
    });
}

main().catch((err) => {
    console.error('❌ Error fatal al iniciar el servidor:', err);
    process.exit(1);
});

export default app;