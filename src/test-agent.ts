import { procesarMensajeCliente } from "./agent/sendaAgent";

async function test() {
  console.log("=== PRUEBA DE SENDA ===\n");
  
  const resultado = await procesarMensajeCliente(
    "Necesito factura por $1500 de diseño web, mi RFC es VICA850101XXX"
  );
  
  console.log(resultado);
}

test();
