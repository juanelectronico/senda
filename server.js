require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { supabase } = require('./src/config/supabase');
const { GoogleGenAI } = require('@google/genai');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// RUTA DE ARCHIVOS PUBLICOS
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// RUTA RAIZ
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'register.html'));
});

// ============================================
// CONFIGURACIÓN DE MERCADO PAGO
// ============================================
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });

// ============================================
// ENDPOINT: REGISTRO DE COMERCIO CON CSD Y PREFERENCIA DE PAGO
// ============================================
app.post('/api/commerce/register', upload.fields([{ name: 'csd_cer', maxCount: 1 }, { name: 'csd_key', maxCount: 1 }]), async (req, res) => {
    console.log('========================================');
    console.log('📥 ENDPOINT /api/commerce/register llamado');
    
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_password } = req.body;
        
        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email || !csd_password) {
            return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
        }

        const cerFile = req.files && req.files['csd_cer'] ? req.files['csd_cer'][0] : null;
        const keyFile = req.files && req.files['csd_key'] ? req.files['csd_key'][0] : null;

        if (!cerFile || !keyFile) {
            return res.status(400).json({ success: false, error: 'Debes subir los archivos .cer y .key' });
        }

        const cerBase64 = fs.readFileSync(cerFile.path).toString('base64');
        const keyBase64 = fs.readFileSync(keyFile.path).toString('base64');

        fs.unlinkSync(cerFile.path);
        fs.unlinkSync(keyFile.path);

        const { data, error } = await supabase.from('commerce').insert([{ 
            rfc, business_name, tax_regime, zip_code, phone, email, 
            csd_cer_base64: cerBase64, csd_key_base64: keyBase64, csd_password, is_active: true 
        }]).select();

        if (error) throw error;

        const commerceId = data[0].id;

        // Creamos la preferencia de Mercado Pago automáticamente al registrarse el comercio
        const preference = new Preference(mpClient);
        const mpResult = await preference.create({
            body: {
                items: [
                    {
                        id: 'plan_beta_senda',
                        title: 'Senda - Plan Beta (Recarga de Facturas)',
                        quantity: 1,
                        unit_price: 50.00,
                        currency_id: 'MXN'
                    }
                ],
                payer: {
                    email: email
                },
                back_urls: {
                    success: 'http://localhost:3000/success.html',
                    failure: 'http://localhost:3000/failure.html',
                    pending: 'http://localhost:3000/pending.html'
                },
                auto_return: 'approved',
                external_reference: commerceId
            }
        });

        res.status(201).json({ 
            success: true, 
            message: 'Comercio registrado exitosamente.', 
            data,
            init_point: mpResult.init_point // Link de pago directo para la vista
        });
    } catch (err) {
        console.error('❌ Error en registro:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// ENDPOINT: CREAR PREFERENCIA DE PAGO (MANUAL / INDependiente)
// ============================================
app.post('/api/payment/create-preference', async (req, res) => {
    console.log('========================================');
    console.log('💳 ENDPOINT /api/payment/create-preference llamado');

    try {
        const { commerceId, email } = req.body;

        const preference = new Preference(mpClient);
        const result = await preference.create({
            body: {
                items: [
                    {
                        id: 'plan_beta_senda',
                        title: 'Senda - Plan Beta (Recarga de Facturas)',
                        quantity: 1,
                        unit_price: 50.00,
                        currency_id: 'MXN'
                    }
                ],
                payer: {
                    email: email || 'test_user@senda.com'
                },
                back_urls: {
                    success: 'http://localhost:3000/success.html',
                    failure: 'http://localhost:3000/failure.html',
                    pending: 'http://localhost:3000/pending.html'
                },
                auto_return: 'approved',
                external_reference: commerceId || 'unknown'
            }
        });

        res.json({ 
            success: true, 
            init_point: result.init_point, 
            preferenceId: result.id 
        });

    } catch (err) {
        console.error('❌ Error al crear preferencia de Mercado Pago:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// ENDPOINT: CHAT-BOT
// ============================================
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });
const sessionState = {};

app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje, sessionId } = req.body;
        const sessionKey = sessionId || 'default';
        if (!sessionState[sessionKey]) sessionState[sessionKey] = { step: 'inicio', datos: {}, pendingData: [] };
        
        const session = sessionState[sessionKey];
        const prompt = `Eres Senda Bot. Maneja el flujo de facturación respondiendo a: "${mensaje}"`;
        
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        res.json({ respuesta: response.text || 'Error en IA' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ENDPOINT: WEBHOOK MERCADO PAGO
// ============================================
app.post('/api/webhook/mercadopago', async (req, res) => {
    console.log('🔔 WEBHOOK RECIBIDO DE MERCADO PAGO');
    console.log('🔍 Datos:', JSON.stringify(req.body, null, 2));
    
    // Aquí puedes procesar cuando el pago sea aprobado para actualizar is_premium o invoice_count en Supabase
    
    res.status(200).send('OK');
});

// ============================================
// ENDPOINT DE PRUEBA
// ============================================
app.post('/api/test/register', upload.fields([{ name: 'csd_cer', maxCount: 1 }, { name: 'csd_key', maxCount: 1 }]), (req, res) => {
    res.json({ success: true, message: 'Test funcionando' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
module.exports = app;
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Senda corriendo en http://localhost:${PORT}`));
}