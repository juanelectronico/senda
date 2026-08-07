// src/features/fiscal/services/geminiExtractor.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { FiscalData } from '../types';

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
      
      const prompt = `
      Extrae los datos fiscales del siguiente mensaje. 
      Busca: RFC, Razón Social, Régimen Fiscal, Uso CFDI, Código Postal, Correo electrónico.
      
      Mensaje: "${message}"
      
      Responde SOLO con un objeto JSON con estos campos:
      {
        "rfc": "string o null",
        "razonSocial": "string o null",
        "regimenFiscal": "string o null",
        "usoCFDI": "string o null",
        "codigoPostal": "string o null",
        "email": "string o null"
      }
      
      Si no encuentras un campo, ponlo como null.
      NO incluyas texto adicional, SOLO el JSON.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Limpiar el texto (por si Gemini devuelve markdown)
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('Error extrayendo datos con Gemini:', error);
      return null;
    }
  }
}