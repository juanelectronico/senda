import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
// import Facturapi from 'facturapi'; // Comentado porque puede no estar instalado/configurado

const router = Router();
// const facturapi = new Facturapi(process.env.FACTURAPI_SECRET_KEY as string); // Comentado temporalmente

// Esta ruta responderá a /factura/:commerceId
router.get('/:commerceId', (req: Request, res: Response) => {
    const { commerceId } = req.params;
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Facturación Senda</title>
        </head>
        <body>
            <form action="/factura/${commerceId}" method="POST" style="max-width: 400px; margin: 50px auto; font-family: sans-serif;">
                <h2>Datos de Facturación</h2>
                <input type="text" name="rfc" placeholder="RFC" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="razonSocial" placeholder="Razón Social" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="regimenFiscal" placeholder="Régimen Fiscal" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="usoCfdi" placeholder="Uso CFDI" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="codigoPostal" placeholder="Código Postal" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="email" name="email" placeholder="Correo Electrónico" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <button type="submit" style="background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Generar Factura</button>
            </form>
        </body>
        </html>
    `);
});

router.post('/:commerceId', async (req: Request, res: Response) => {
    const { commerceId } = req.params;
    const { rfc, razonSocial, regimenFiscal, usoCfdi, codigoPostal, email } = req.body;
    
    try {
        const { data, error } = await supabase.from('Invoice').insert([{
            customerRfc: rfc,
            customerEmail: email,
            commerceId: commerceId,
            status: 'PENDING',
            razon_social: razonSocial,
            regimen_fiscal: regimenFiscal,
            uso_cfdi: usoCfdi,
            codigo_postal: codigoPostal
        }]);

        if (error) throw error;

        res.send(`
            <h2>✅ Datos recibidos para: ${commerceId}</h2>
            <p>Factura en proceso de generación...</p>
            <p><strong>RFC:</strong> ${rfc}</p>
            <p><strong>Razón Social:</strong> ${razonSocial}</p>
            <p><strong>Email:</strong> ${email}</p>
            <a href="/factura/${commerceId}">← Volver</a>
        `);
    } catch (err: any) {
        console.error('Error al guardar factura:', err);
        res.status(500).send(`
            <h2>❌ Error</h2>
            <p>${err.message}</p>
            <a href="/factura/${commerceId}">← Intentar nuevamente</a>
        `);
    }
});

export default router;