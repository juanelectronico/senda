const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

async function test() {
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Di hola',
    });
    
    console.log('Respuesta:', response.text);
}

test().catch(console.error);