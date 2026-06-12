import { GoogleGenAI } from "@google/genai";

// Configuración de Gemini
const ai = new GoogleGenAI({
  vertexai: true,
  project: "project-9a1eb3ec-f78b-469d-bda",
  location: "us-central1"
});

// Facturapi se usará más adelante con la sintaxis correcta
// Por ahora, simulamos la generación de facturas para probar Gemini

async function extraerDatosFactura(mensaje: string) {
  const prompt = `
    Del siguiente mensaje, extrae SOLO en JSON:
    {"monto": 0.0, "concepto": "texto", "rfc": "texto o null"}
    Mensaje: "${mensaje}"
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const texto = response.text;
  if (!texto) {
    return { monto: 0, concepto: "", rfc: null };
  }
  
  return JSON.parse(texto);
}

function calcularImpuestos(monto: number) {
  const subtotal = monto / 1.16;
  const iva = monto - subtotal;
  return { subtotal, iva, total: monto };
}

// Función simulada de facturación (por ahora, sin Facturapi)
async function generarFacturaSimulada(datos: { rfc: string; monto: number; concepto: string }) {
  // Simulamos una factura
  return {
    factura_id: `SIM-${Date.now()}`,
    pdf_url: `https://senda.app/facturas/simulada-${Date.now()}.pdf`,
    xml_url: `https://senda.app/facturas/simulada-${Date.now()}.xml`
  };
}

export async function procesarMensajeCliente(mensaje: string) {
  console.log("📨 Procesando mensaje:", mensaje);
  
  // 1. Extraer datos
  const datos = await extraerDatosFactura(mensaje);
  console.log("📊 Datos extraídos:", datos);
  
  // 2. Validar RFC
  if (!datos.rfc) {
    return "❌ No encontré tu RFC. Por favor escríbelo: RFC: XXXXXX";
  }
  
  // 3. Validar monto
  if (!datos.monto || datos.monto <= 0) {
    return "❌ No encontré el monto. Por favor escríbelo: Monto: $1500";
  }
  
  // 4. Calcular impuestos
  const impuestos = calcularImpuestos(datos.monto);
  
  // 5. Generar factura (simulada por ahora)
  const factura = await generarFacturaSimulada({
    rfc: datos.rfc,
    monto: datos.monto,
    concepto: datos.concepto || "Servicios profesionales"
  });
  
  // 6. Resultado
  return `✅ FACTURA GENERADA (SIMULADA)
  
ID: ${factura.factura_id}
Monto: $${datos.monto}
Subtotal: $${impuestos.subtotal.toFixed(2)}
IVA: $${impuestos.iva.toFixed(2)}

PDF: ${factura.pdf_url}
XML: ${factura.xml_url}

⚠️ Nota: Factura simulada. Conecta Facturapi para facturas reales.

Gracias por usar Senda.`;
}