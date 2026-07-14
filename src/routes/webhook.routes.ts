import { Router, Request, Response } from 'express';
// @ts-ignore
import { supabase } from '../config/supabase';

const router = Router();

router.post('/mercadopago', async (req: Request, res: Response) => {
    // 1. RESPUESTA INMEDIATA: Esto evita el error de 1111 - timeout
    res.status(200).send('OK');

    // 2. PROCESAMIENTO: La lógica continúa en segundo plano
    const data = req.body;
    const paymentId = data?.data?.id || data?.id;
    const isPayment = data?.type === 'payment' || data?.topic === 'payment';

    if (!isPayment || !paymentId) {
        console.log('ℹ️ Webhook recibido sin datos de pago.');
        return;
    }

    try {
        console.log('📨 Procesando pago real. ID:', paymentId);

        // Consultar detalle a Mercado Pago (API real)
        const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json' 
            }
        });
        
        if (!response.ok) throw new Error(`API MP respondió: ${response.status}`);
        
        const payment = await response.json();

        // 3. Lógica de negocio: Actualizar a Premium en Supabase
        if (payment.status === 'approved' && payment.external_reference) {
            const commerceId = payment.external_reference;

            const { error } = await supabase
                .from('commerce')
                .update({ is_premium: true })
                .eq('id', commerceId);
            
            if (error) throw error;
            
            console.log(`✅ Comercio ${commerceId} actualizado a Premium.`);
        }
    } catch (error: any) {
        console.error('❌ Error en procesamiento de Webhook:', error.message);
    }
});

export default router;