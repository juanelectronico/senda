import { Router, Request, Response } from 'express';

// @ts-ignore
import { supabase } from '../config/supabase';

const router = Router();

router.post('/mercadopago', async (req: Request, res: Response) => {
    // Obtenemos los datos del cuerpo de la petición
    const data = (req as any).body;

    // Solo nos interesa el evento de tipo "payment"
    // Validamos que exista data.data y un ID para evitar errores de acceso a propiedades
    if ((data?.type === 'payment' || data?.topic === 'payment') && data?.data?.id) {
        try {
            const paymentId = data.data.id;
            console.log('📨 Webhook recibido. ID:', paymentId);

            // FILTRO DE SEGURIDAD: 
            // Los IDs de simulación son cortos; la API real requiere IDs largos.
            if (paymentId.toString().length < 10) {
                console.log('⚠️ ID de prueba detectado, omitiendo consulta a API real.');
            } else {
                // Consultar el detalle del pago a Mercado Pago
                const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                    method: 'GET',
                    headers: { 
                        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json' 
                    }
                });
                
                if (!response.ok) {
                    const errorDetail = await response.text();
                    throw new Error(`API Mercado Pago respondió: ${response.status} - ${errorDetail}`);
                }
                
                const payment = await response.json();

                // Verificar si el pago fue aprobado
                if (payment.status === 'approved' && payment.external_reference) {
                    const commerceId = payment.external_reference;

                    const { error } = await supabase
                        .from('commerce')
                        .update({ is_premium: true })
                        .eq('id', commerceId);
                    
                    if (error) throw error;
                    
                    console.log(`✅ Comercio ${commerceId} actualizado a Premium.`);
                }
            }
        } catch (error: any) {
            console.error('❌ Error en Webhook:', error.message);
        }
    }

    // Mercado Pago siempre espera un 200 OK para dejar de enviar la notificación
    return res.status(200).send('OK');
});

export default router;