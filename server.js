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
// ENDPOINT: REGISTRO DE COMERCIO CON CSD (VERSIÓN DE PRUEBA)
// ============================================
app.post('/api/commerce/register', upload.fields([{ name: 'csd_cer', maxCount: 1 }, { name: 'csd_key', maxCount: 1 }]), async (req, res) => {
    console.log('========================================');
    console.log('📥 ENDPOINT /api/commerce/register llamado');
    console.log('📋 Body (campos de texto):', req.body);
    console.log('📁 Files (archivos):', req.files);
    console.log('========================================');
    
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_password } = req.body;
        
        // Validar campos obligatorios
        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email || !csd_password) {
            console.log('❌ Error: Faltan campos obligatorios');
            return res.status(400).json({ 
                success: false, 
                error: 'Faltan campos obligatorios',
                recibido: req.body 
            });
        }

        // Leer archivos CSD
        const cerFile = req.files['csd_cer'] ? req.files['csd_cer'][0] : null;
        const keyFile = req.files['csd_key'] ? req.files['csd_key'][0] : null;

        if (!cerFile || !keyFile) {
            console.log('❌ Error: Faltan archivos .cer o .key');
            return res.status(400).json({ 
                success: false, 
                error: 'Debes subir los archivos .cer y .key',
                files: req.files 
            });
        }

        console.log('✅ Archivos recibidos correctamente');
        console.log(`📄 .cer: ${cerFile.originalname} (${cerFile.size} bytes)`);
        console.log(`📄 .key: ${keyFile.originalname} (${keyFile.size} bytes)`);

        // Convertir archivos a base64 para guardar en Supabase
        const cerBase64 = fs.readFileSync(cerFile.path).toString('base64');
        const keyBase64 = fs.readFileSync(keyFile.path).toString('base64');

        // Limpiar archivos temporales
        fs.unlinkSync(cerFile.path);
        fs.unlinkSync(keyFile.path);
        console.log('🗑️ Archivos temporales eliminados');

        console.log('💾 Intentando guardar en Supabase...');
        
        // Guardar en Supabase
        const { data, error } = await supabase.from('commerce').insert([{ 
            rfc, 
            business_name, 
            tax_regime, 
            zip_code, 
            phone, 
            email, 
            csd_cer_base64: cerBase64,
            csd_key_base64: keyBase64,
            csd_password,
            is_active: true 
        }]).select();

        if (error) {
            console.log('❌ Error de Supabase:', error);
            throw error;
        }

        console.log('✅ Registro exitoso en Supabase');
        console.log('📊 Data:', data);

        res.status(201).json({ 
            success: true, 
            message: 'Comercio registrado exitosamente. Credenciales CSD guardadas.',
            data 
        });

    } catch (err) {
        console.error('❌ Error en registro:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            stack: err.stack 
        });
    }
});

// ============================================
// ENDPOINT: CHAT-BOT CON FLUJO DE FACTURACIÓN
// ============================================
const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K6pX_WHhQkc9NZEG-GH4Ytprw13x9kXX0tFtYCt2N0wQ';
const ai = new GoogleGenAI({ apiKey });

// Estado de la conversación (en memoria - para demo)
const sessionState = {};

app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje, sessionId } = req.body;
        const sessionKey = sessionId || 'default';
        
        // Inicializar sesión si no existe
        if (!sessionState[sessionKey]) {
            sessionState[sessionKey] = {
                step: 'inicio',
                datos: {},
                pendingData: []
            };
        }
        
        const session = sessionState[sessionKey];

        const prompt = `Eres Senda Bot, un asistente experto en facturación CFDI para comercios mexicanos.

        FLUJO DE FACTURACIÓN (sigue estas reglas EXACTAMENTE):

        PASO 1: SALUDO INICIAL
        Si el cliente dice "hola", "quiero facturar", "factura", etc., responde:
        "¡Hola! Claro, con gusto te ayudo a generar tu factura. Para comenzar, necesito los siguientes datos fiscales:
        
        📋 RFC:
        🏢 Razón Social:
        ⚖️ Régimen Fiscal (número, ej. 601, 612, 626):
        📄 Uso CFDI (ej. G01, G03):
        📮 Código Postal:
        📧 Correo electrónico:
        
        Envíame todos los datos en este orden en un solo mensaje."

        PASO 2: VALIDACIÓN DE DATOS
        Cuando el cliente envíe los datos:
        - VALIDA cada campo:
          * RFC: 12-13 caracteres alfanuméricos
          * Razón Social: texto, no vacío
          * Régimen Fiscal: 3 dígitos (601, 612, 626, etc.)
          * Uso CFDI: 3 caracteres (G01, G03, G02, etc.)
          * Código Postal: 5 dígitos
          * Correo: formato de email válido

        - Si FALTA algún dato, responde:
          "Gracias. Solo me falta: [campo faltante]. ¿Me lo proporcionas?"

        - Si algún dato es INVÁLIDO, responde:
          "El [campo] '[dato ingresado]' no es válido. Por favor, verifica y envíalo nuevamente."

        - Si TODOS son válidos y completos, responde:
          "✅ Datos recibidos correctamente.
          Tu factura está siendo procesada.
          El comercio la revisará en breve."

        PASO 3: SEGUIMIENTO
        - Siempre sé amable y profesional
        - Responde en español
        - Si no sabes algo, sugiere contactar a soporte

        HISTORIAL DE LA CONVERSACIÓN:
        - Paso actual: ${session.step}
        - Datos recopilados: ${JSON.stringify(session.datos)}
        - Campos pendientes: ${JSON.stringify(session.pendingData)}

        MENSAJE DEL CLIENTE: "${mensaje}"

        TU RESPUESTA (SOLO LA RESPUESTA, SIN COMENTARIOS ADICIONALES):`;
        
        const response = await ai.models.generateContent({ 
            model: 'gemini-2.5-flash', 
            contents: prompt
        });
        
        const respuesta = response.text || 'Lo siento, no pude procesar tu solicitud.';
        
        // Actualizar el estado de la sesión (lógica básica)
        if (mensaje.toLowerCase().includes('rfc:') || mensaje.toLowerCase().includes('razón social:')) {
            session.step = 'validando';
        }
        
        res.json({ respuesta });
        
    } catch (err) {
        console.error('Error en chat-bot:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ENDPOINT DE PRUEBA (SIN SUPABASE)
// ============================================
app.post('/api/test/register', upload.fields([{ name: 'csd_cer', maxCount: 1 }, { name: 'csd_key', maxCount: 1 }]), (req, res) => {
    console.log('🧪 TEST ENDPOINT llamado');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    res.json({
        success: true,
        message: 'Test endpoint funcionando',
        body: req.body,
        files: req.files ? {
            cer: req.files['csd_cer'] ? req.files['csd_cer'][0].originalname : null,
            key: req.files['csd_key'] ? req.files['csd_key'][0].originalname : null
        } : null
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
module.exports = app;
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Senda corriendo en http://localhost:${PORT}`));
}