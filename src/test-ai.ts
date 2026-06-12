import { processFiscalData } from './services/geminiVertex';

async function probarIA() {
  console.log("Conectando con Gemini en Senda...");
  try {
    const resultado = await processFiscalData("RFC: VICA850101XXX, Monto: 1500.00 MXN, Concepto: Servicios de diseño.");
    console.log("Respuesta de la IA:", resultado);
  } catch (error) {
    console.error("Algo falló en la prueba:", error);
  }
}

probarIA();