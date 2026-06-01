import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase'; 

const router = Router();

/**
 * 1. RUTA GET: Formulario para el cliente
 */
router.get('/factura/:commerceId', (req: Request, res: Response) => {
  const { commerceId } = req.params;

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Facturación - Senda</title>
      <style>
        body { font-family: sans-serif; background: #f8fafc; padding: 20px; display: flex; justify-content: center; }
        .card { background: white; padding: 25px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); max-width: 400px; width: 100%; border: 1px solid #e2e8f0; }
        input { width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; background: #0f172a; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Solicitud de Factura</h2>
        <form action="/factura/${commerceId}" method="POST">
          <label>RFC</label>
          <input type="text" name="rfc" required style="text-transform: uppercase;">
          <label>Razón Social</label>
          <input type="text" name="razonSocial" required style="text-transform: uppercase;">
          <label>Régimen Fiscal</label>
          <input type="text" name="regimenFiscal" required>
          <label>Uso de CFDI</label>
          <input type="text" name="usoCfdi" required style="text-transform: uppercase;">
          <label>Código Postal</label>
          <input type="text" name="codigoPostal" required>
          <label>Correo Electrónico</label>
          <input type="email" name="email" required>
          <button type="submit">Generar Factura</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

/**
 * 2. RUTA POST: Guardado en Supabase
 */
router.post('/factura/:commerceId', async (req: Request, res: Response) => {
  const { commerceId } = req.params;
  const { rfc, razonSocial, regimenFiscal, usoCfdi, codigoPostal, email } = req.body;

  console.log(`📬 Insertando factura en Supabase para el comercio: ${commerceId}...`);

  try {
    const idUnico = Math.random().toString(36).substring(2, 11).toUpperCase();

    const { data, error } = await supabase
      .from('Invoice') // Nombre exacto de tu tabla
      .insert([
        { 
          id: idUnico,
          amount: 0,
          customerRfc: rfc.toUpperCase().trim(),
          customerEmail: email.toLowerCase().trim(),
          facturapiId: '',
          commerceId: commerceId, 
          razon_social: razonSocial.toUpperCase().trim(),
          regimen_fiscal: regimenFiscal.trim(),
          uso_cfdi: usoCfdi.toUpperCase().trim(),
          codigo_postal: codigoPostal.trim() 
        }
      ]);

    if (error) {
      console.error('❌ Error de Supabase:', error.message);
      return res.status(500).send(`<h2>Error: ${error.message}</h2>`);
    }

    res.send(`
      <div style="text-align: center; margin-top: 50px;">
        <h2 style="color: green;">¡Éxito!</h2>
        <p>Datos guardados correctamente.</p>
      </div>
    `);

  } catch (err) {
    res.status(500).send('Error interno del servidor.');
  }
});

export default router;