require('dotenv').config();
const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K6pX_WHhQkc9NZEG-GH4Ytprw13x9kXX0tFtYCt2N0wQ';
const ai = new GoogleGenAI({ apiKey: apiKey });

console.log('✅ Google Gen AI listo');

app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje } = req.body;
        console.log('📨 Mensaje:', mensaje);
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Eres Senda Bot. Cliente dice: "${mensaje}"`,
        });
        
        res.json({ respuesta: response.text });
        
    } catch (err) {
        console.error('❌ Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('🚀 Senda en http://localhost:3000'));