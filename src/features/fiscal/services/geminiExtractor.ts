// src/features/fiscal/services/geminiExtractor.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { FiscalData } from '../types/index.js';

export class GeminiExtractor {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no está configurada');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async extractFiscalData(message: string): Promise<Partial<FiscalData> | null> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
      const prompt = `Extrae los siguientes datos fiscales y el monto del texto del usuario: RFC, Razón Social, Régimen Fiscal, Uso CFDI, Código Postal, Correo electrónico y Monto.
      Texto: "${message}"
      
      Reglas:
      1. Devuelve estrictamente un objeto JSON plano.
      2. Llaves exactas: "rfc", "razonSocial", "regimenFiscal", "usoCFDI", "codigoPostal", "email", "monto".
      3. Si falta algún dato, usa null.
      4. Si el monto existe, extrae solo el valor numérico.
      5. No incluyas explicaciones, bloques markdown ni formato de código; solo el JSON puro.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      // Limpiar marcadores de markdown si los hay
      const cleanText = text.replace(/```json|```/g, '').trim();
      
      // Parsear el JSON
      const data = JSON.parse(cleanText);
      
      // Validar que los campos sean correctos
      return {
        rfc: data.rfc || null,
        razonSocial: data.razonSocial || null,
        regimenFiscal: data.regimenFiscal || null,
        usoCFDI: data.usoCFDI || null,
        codigoPostal: data.codigoPostal || null,
        email: data.email || null,
        monto: data.monto !== undefined && data.monto !== null ? Number(data.monto) : null
      };
    } catch (error) {
      console.error('❌ Error extrayendo datos fiscales con Gemini:', error);
      return null;
    }
  }
}