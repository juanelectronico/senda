import 'dotenv/config';
import express from 'express';
import path from 'path';
import { supabase } from './config/supabase';
// 1. Importamos la librería de Google instalada
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());

// 2. Inicializamos Gemini usando la clave de tu .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Servir el frontend
app.use(express.static(path.join(__dirname, '../public')));

// Ruta POST para recibir datos del formulario y guardar en Supabase
app.post('/api/customers', async (req, res) => {
    try {
        const { customerEmail, customerRfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal } = req.body;
        
        const nuevoId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        const { data, error } = await supabase.from('Invoice').insert([{ 
            id: nuevoId,
            customerEmail,
            customerRfc,
            razon_social,
            regimen_fiscal,
            uso_cfdi,
            codigo_postal,
            commerceId: 'tienda_juan', 
            status: 'PENDING_CONFIRMATION', 
            amount: 0
        }]);

        if (error) throw error;
        res.status(201).json({ success: true, data });
    } catch (err: any) {
        console.error("Error al guardar:", err);
        res.status(500).json({ error: err.message });
    }
});

// Ruta de diagnóstico (la que ya probamos con éxito)
app.get('/api/check-facturapi', async (req, res) => {
    try {
        const apiKey = process.env.FACTURAPI_SECRET_KEY;
        if (!apiKey) return res.status(500).json({ status: 'Error', message: 'API KEY no configurada' });

        const response = await fetch('https://www.facturapi.io/v2/invoices', {
            method: 'GET',
            headers: { 'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64') }
        });

        if (response.ok) res.json({ status: 'Conexión exitosa' });
        else res.status(response.status).json({ status: 'Error de conexión' });
    } catch (err: any) {
        res.status(500).json({ status: 'Falla', message: err.message });
    }
});

// 3. RUTA DEL CHATBOT: Ahora sí, usando tu modelo Gemini 2.5 Flash
app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje } = req.body;
        if (!mensaje) return res.status(400).json({ error: "Falta el campo 'mensaje'" });

        // Usamos el modelo exacto que listó tu cuenta: gemini-2.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const promptAsistente = `Eres Senda Bot, un asistente virtual de facturación automática para una tienda. 
        El cliente dice: "${mensaje}". 
        Responde de manera muy amable, clara y en un máximo de dos párrafos. Recuerda siempre de forma sutil que necesitas su RFC para iniciar el proceso de facturación si es que no lo ha dado.`;

        const result = await model.generateContent(promptAsistente);
        const response = await result.response;
        
        res.json({ respuesta: response.text() });
    } catch (err: any) {
        console.error("❌ Error en Gemini:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('🚀 Senda listo en http://localhost:3000'));