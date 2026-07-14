require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { supabase } = require('./src/config/supabase');
const { GoogleGenAI } = require('@google/genai');

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
// ENDPOINT: REGISTRO DE COMERCIO CON CSD
// ============================================
app.post('/api/commerce/register', upload.fields([{ name: 'csd_cer', maxCount: 1 }, { name: 'csd_key', maxCount: 1 }]), async (req, res) => {
    console.log('========================================');
    console.log('📥 ENDPOINT /api/commerce/register llamado');
    
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_password } = req.body;
        
        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email || !csd_password) {
            return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
        }

        const cerFile = req.files['csd_cer'] ? req.files['csd_cer'][0] : null;
        const keyFile = req.files['csd_key'] ? req.files['csd_key'][0] : null;

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

        res.status(201).json({ success: true, message: 'Comercio registrado exitosamente.', data });
    } catch (err) {
        console.error('❌ Error en registro:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// ENDPOINT: CHAT-BOT
// ============================================
const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K6pX_WHhQkc9NZEG-GH4Ytprw13x9kXX0tFtYCt2N0wQ';
const ai = new GoogleGenAI({ apiKey });
const sessionState = {};

app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje, sessionId } = req.body;
        const sessionKey = sessionId || 'default';
        if (!sessionState[sessionKey]) sessionState[sessionKey] = { step: 'inicio', datos: {}, pendingData: [] };
        
        const session = sessionState[sessionKey];
        const prompt = `Eres Senda Bot. Maneja el flujo de facturación... (tu prompt actual)`;
        
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        res.json({ respuesta: response.text || 'Error en IA' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ENDPOINT: WEBHOOK MERCADO PAGO
// ============================================
app.post('/api/webhook/mercadopago', (req, res) => {
    console.log('🔔 WEBHOOK RECIBIDO DE MERCADO PAGO');
    console.log('🔍 Datos:', JSON.stringify(req.body, null, 2));
    // Mercado Pago requiere un status 200 rápido para validar la URL
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