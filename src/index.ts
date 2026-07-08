import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { supabase } from './config/supabase';
import { VertexAI } from '@google-cloud/vertexai';

// Importación de rutas
import webhookRoutes from './routes/webhook.routes';
import facturaRoutes from './routes/factura.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- MIDDLEWARE DE DIAGNÓSTICO ---
app.use((req, res, next) => {
    console.log(`[LOG]: Petición recibida -> ${req.method} ${req.path}`);
    next();
});

// --- RUTA DE REGISTRO ---
app.post('/register', async (req, res) => {
    try {
        const { rfc, business_name, tax_regime, zip_code, phone, email, csd_cer_base64, csd_key_base64, csd_password } = req.body;

        if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
            return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
        }

        const { data, error } = await supabase
            .from('commerce')
            .insert({
                rfc, business_name, tax_regime, zip_code, phone, email,
                csd_cer_base64: csd_cer_base64 || '',
                csd_key_base64: csd_key_base64 || '',
                csd_password: csd_password || '',
                is_active: true,
                is_premium: false,
                invoice_count: 0
            })
            .select()
            .single();

        if (error) throw error;

        return res.json({
            success: true,
            message: '✅ ¡Registro exitoso!',
            commerce: { id: data.id, business_name: data.business_name, phone: data.phone }
        });
    } catch (err: any) {
        console.error('Error en registro:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Registro de otras rutas
app.use('/webhook', webhookRoutes);
app.use('/', facturaRoutes);

// Configuración de Vertex AI
const project = process.env.GOOGLE_CLOUD_PROJECT || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertexAI = new VertexAI({ project, location });
const modelName = `projects/${project}/locations/${location}/publishers/google/models/gemini-1.5-flash`;
const model = vertexAI.preview.getGenerativeModel({ model: modelName });

console.log('✅ Senda API lista');

// Ruta de Chatbot Optimizada
app.post('/api/chat-bot', async (req: any, res: any) => {
    try {
        const { mensaje } = req.body;
        let contextoBD = "No se ha encontrado información específica del comercio.";
        const rfcMatch = mensaje.match(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/i);
        
        if (rfcMatch) {
            const { data } = await supabase
                .from('commerce')
                .select('business_name, rfc, phone, is_active, is_premium, invoice_count')
                .eq('rfc', rfcMatch[0].toUpperCase())
                .single();

            if (data) {
                contextoBD = `DATOS DEL COMERCIO: Nombre: ${data.business_name}, RFC: ${data.rfc}, Tel: ${data.phone}, ¿Activo?: ${data.is_active ? 'Sí' : 'No'}, ¿Premium?: ${data.is_premium ? 'Sí' : 'No'}, Facturas emitidas: ${data.invoice_count}.`;
            }
        }

        const prompt = `Eres Senda Bot, un asistente profesional. USA ESTA INFORMACIÓN: ${contextoBD}. Si la información no está en el contexto, indícalo profesionalmente. MENSAJE: "${mensaje}".`;
        
        const response = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const respuesta = response.response.candidates?.[0].content.parts?.[0].text || "No pude generar una respuesta.";
        res.json({ respuesta });
    } catch (err: any) {
        console.error('Error en chatbot:', err);
        res.status(500).json({ error: 'Error en IA: ' + err.message });
    }
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Senda corriendo en http://localhost:${PORT}`));