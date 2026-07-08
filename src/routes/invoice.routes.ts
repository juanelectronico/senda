import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase'; 
import { z } from 'zod';

const router = Router();

const InvoiceSchema = z.object({
  rfc: z.string().min(12).max(13),
  razonSocial: z.string().min(3),
  regimenFiscal: z.string().min(3),
  usoCfdi: z.string().length(3),
  codigoPostal: z.string().length(5),
  email: z.string().email(),
});

router.get('/factura/:commerceId', (req: Request, res: Response) => {
  const { commerceId } = req.params;
  // Agregado return
  return res.send(`
    <form action="/factura/${commerceId}" method="POST">
      <input name="rfc" placeholder="RFC" required><br>
      <input name="razonSocial" placeholder="Razón Social" required><br>
      <input name="regimenFiscal" placeholder="Régimen Fiscal" required><br>
      <input name="usoCfdi" placeholder="Uso CFDI" required><br>
      <input name="codigoPostal" placeholder="Código Postal" required><br>
      <input name="email" type="email" placeholder="Email" required><br>
      <button type="submit">Generar Factura</button>
    </form>
  `);
});

router.post('/factura/:commerceId', async (req: Request, res: Response) => {
  try {
    const validatedData = InvoiceSchema.parse(req.body);
    const { commerceId } = req.params;

    const { error } = await supabase
      .from('Factura') 
      .insert([{ 
        commerceId: commerceId,
        customerRfc: validatedData.rfc.toUpperCase(),
        customerEmail: validatedData.email.toLowerCase(),
        razon_social: validatedData.razonSocial.toUpperCase(),
        regimen_fiscal: validatedData.regimenFiscal,
        uso_cfdi: validatedData.usoCfdi.toUpperCase(),
        codigo_postal: validatedData.codigoPostal
      }]);

    if (error) {
      console.error("Error exacto de Supabase:", error);
      // Agregado return
      return res.status(500).json({ error: error.message });
    }

    // Agregado return
    return res.status(201).send('<h1>Factura registrada con éxito</h1>');
  } catch (err: any) {
    // Agregado return
    return res.status(400).send(`Error en datos: ${err.message}`);
  }
});

export default router;