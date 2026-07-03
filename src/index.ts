import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// @ts-ignore
import { supabase } from './config/supabase';
// @ts-ignore
import { VertexAI } from '@google-cloud/vertexai';

import webhookRoutes from './routes/webhook.routes';

const app = express();
app.use(cors());
app.use(express.json());

// Tus rutas de webhook
app.use('/webhook', webhookRoutes);

// Configuración de Vertex AI
const project = process.env.GOOGLE_CLOUD_PROJECT || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

const vertexAI = new VertexAI({
    project: project,
    location: location
});

// Ruta completa al modelo
const modelName = `projects/${project}/locations/${location}/publishers/google/models/gemini-1.5-flash`;

const model = vertexAI.preview.getGenerativeModel({ 
    model: modelName 
});

console.log('✅ Senda API lista (Vertex AI - Configurado)');

app.post('/api/chat-bot', async (req: any, res: any) => {
    try {
        const { mensaje } = req.body;
        console.log('📨 Mensaje recibido:', mensaje);
        
        let contextoBD = "No se ha encontrado información específica del comercio.";
        const rfcMatch = mensaje.match(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/i);
        
        if (rfcMatch) {
            const rfcBuscado = rfcMatch[0].toUpperCase();
            const { data } = await supabase
                .from('Commerce')
                .select('*')
                .eq('rfc', rfcBuscado);

            if (data && data.length > 0) {
                const c = data[0];
                contextoBD = `DATOS DEL COMERCIO: Nombre: ${c.name}, RFC: ${c.rfc}, Tel: ${c.ownerPhone}`;
            }
        }

        const prompt = `Eres Senda Bot, asistente administrativo experto. 
        INFORMACIÓN ENCONTRADA EN BASE DE DATOS: ${contextoBD}
        MENSAJE DEL CLIENTE: "${mensaje}"
        Responde de forma profesional y utiliza la información del comercio si está disponible.`;

        // Generación de contenido
        const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        // Acceso seguro a la respuesta
        const respuesta = response.response.candidates?.[0].content.parts?.[0].text || "No pude generar una respuesta.";
        
        res.json({ respuesta });
        
    } catch (err: any) {
        console.error('❌ Error en Senda Bot:', err.message);
        res.status(500).json({ error: 'Error en la conexión con la IA: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Senda corriendo en http://localhost:${PORT}`));