import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
async function run() {
    // Pasa la llave explícitamente en el objeto de opciones
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Hola Gemini, dime que estás activo para Senda.',
        });
        console.log('Respuesta de Gemini:', response.text);
    }
    catch (error) {
        console.error('Fallo la prueba de Gemini:', error);
    }
}
run();
