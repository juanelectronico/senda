import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// Ruta GET: Formulario de Facturación
router.get('/:commerceId', (req: Request, res: Response) => {
    const { commerceId } = req.params;
    // Agregamos return
    return res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>Facturación Senda</title></head>
        <body>
            <form action="/factura/${commerceId}" method="POST" style="max-width: 400px; margin: 50px auto; font-family: sans-serif;">
                <h2>Datos de Facturación</h2>
                <input type="text" name="rfc" placeholder="RFC" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="razonSocial" placeholder="Razón Social" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="regimenFiscal" placeholder="Régimen Fiscal" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="usoCfdi" placeholder="Uso CFDI" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="text" name="codigoPostal" placeholder="Código Postal" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <input type="email" name="email" placeholder="Correo Electrónico" required style="display:block; width:100%; margin-bottom:10px; padding:8px;">
                <button type="submit" style="background-color: #19C0D4; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Generar Factura</button>
            </form>
        </body>
        </html>
    `);
});

// Ruta POST: Procesa la factura y valida el límite
router.post('/:commerceId', async (req: Request, res: Response) => {
    const { commerceId } = req.params;
    const { rfc, razonSocial, regimenFiscal, usoCfdi, codigoPostal, email } = req.body;
    
    try {
        const { data: commerce, error: commerceError } = await supabase
            .from('commerce')
            .select('is_premium, invoice_count')
            .eq('id', commerceId)
            .single();

        if (commerceError || !commerce) throw new Error('Comercio no encontrado');

        // 2. GATEKEEPER
        if (commerce.is_premium === false && commerce.invoice_count >= 5) {
            return res.status(403).send(`
                <h2>🚫 Límite alcanzado</h2>
                <p>Has agotado tus 5 facturas de prueba.</p>
                <a href="/activar-plan">Activar plan premium para facturación ilimitada</a>
            `);
        }

        // 3. Insertar factura
        const { error: insertError } = await supabase.from('Invoice').insert([{
            customerRfc: rfc,
            customerEmail: email,
            commerceId: commerceId,
            status: 'PENDING',
            razon_social: razonSocial,
            regimen_fiscal: regimenFiscal,
            uso_cfdi: usoCfdi,
            codigo_postal: codigoPostal
        }]);

        if (insertError) throw insertError;

        // 4. Incrementar contador
        if (commerce.is_premium === false) {
            await supabase.from('commerce')
                .update({ invoice_count: commerce.invoice_count + 1 })
                .eq('id', commerceId);
        }

        // Agregamos return
        return res.send(`<h2>✅ Factura registrada con éxito.</h2><a href="/factura/${commerceId}">← Regresar</a>`);

    } catch (err: any) {
        console.error('Error:', err);
        // Agregamos return
        return res.status(500).send(`<h2>❌ Error: ${err.message}</h2>`);
    }
});

export default router;