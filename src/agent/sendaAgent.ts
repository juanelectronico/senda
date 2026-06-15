require('dotenv').config();

import { GoogleGenAI } from "@google/genai";
import Facturapi from "facturapi";

// Verificamos si la llave existe
console.log("LLAVE CARGADA:", process.env.FACTURAPI_SECRET_KEY ? "SÍ" : "NO");

// Inicializamos UNA SOLA VEZ
const facturapi = new Facturapi(process.env.FACTURAPI_SECRET_KEY || "");

const ai = new GoogleGenAI({
  vertexai: true,
  project: "project-9a1eb3ec-f78b-469d-bda",
  location: "us-central1"
});

async function extraerDatosFactura(mensaje: string) {
  const prompt = `Extrae en JSON: {"monto": 0.0, "concepto": "texto", "rfc": "texto"}. Mensaje: "${mensaje}"`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text || "{}");
}

function calcularImpuestos(monto: number) {
  const subtotal = monto / 1.16;
  const iva = monto - subtotal;
  return { subtotal, iva };
}

async function generarFacturaReal(datos: { rfc: string; monto: number; concepto: string }) {
  const invoice = await facturapi.invoices.create({
    customer: { taxid: datos.rfc },
    items: [{
      quantity: 1,
      product: { description: datos.concepto, price: datos.monto / 1.16 }
    }],
    payment_form: "01"
  });

  return { 
    factura_id: invoice.id, 
    pdf_url: (invoice as any).pdf_url, 
    xml_url: (invoice as any).xml_url 
  };
}

export async function procesarMensajeCliente(mensaje: string) {
  const datos = await extraerDatosFactura(mensaje);
  if (!datos.rfc) return "❌ Error: Necesito un RFC válido.";

  try {
    const factura = await generarFacturaReal(datos);
    return `✅ FACTURA GENERADA CON ÉXITO
ID: ${factura.factura_id}
PDF: ${factura.pdf_url}
XML: ${factura.xml_url}`;
  } catch (e) {
    console.error(e);
    return "❌ Error al generar la factura real en Facturapi.";
  }
}