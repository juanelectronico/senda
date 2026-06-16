import 'dotenv/config';
import express from 'express';
import { supabase } from './config/supabase';
import facturaRouter from './routes/factura.routes';
import commerceRoutes from './routes/commerce.routes';

// Usar require en lugar de import (funcionó en la prueba)
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rutas
app.use('/factura', facturaRouter);
app.use('/api/commerce', commerceRoutes);

const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K6pX_WHhQkc9NZEG-GH4Ytprw13x9kXX0tFtYCt2N0wQ';
const ai = new GoogleGenAI({ apiKey: apiKey });

console.log('✅ Google Gen AI listo');

app.post('/api/customers', async (req, res) => {
    try {
        const { customerEmail, customerRfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal } = req.body;
        await supabase.from('Invoice').insert([{ 
            customerEmail, customerRfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal,
            commerceId: 'tienda_juan', status: 'PENDING_CONFIRMATION', amount: 0
        }]);
        res.status(201).json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje } = req.body;
        console.log('📨 Mensaje:', mensaje);
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Eres Senda Bot, asistente de facturación. El cliente dice: "${mensaje}". Responde amablemente.`,
        });
        
        console.log('✅ Respuesta recibida');
        res.json({ respuesta: response.text });
        
    } catch (err: any) {
        console.error('❌ Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('🚀 Senda en http://localhost:3000'));