import { Router } from 'express';
import { MercadoPagoConfig, Preference } from 'mercadopago';
const router = Router();
// Inicializar Mercado Pago con tu token de producción que ya está en las variables de entorno de Cloud Run
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || ''
});
router.post('/create-preference', async (req, res) => {
    try {
        const { commerceId, email } = req.body;
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: [
                    {
                        id: 'beta-plan-5-invoices',
                        title: 'Senda - Plan Beta (Recarga de Facturas)',
                        quantity: 1,
                        unit_price: 50, // 50 MXN
                        currency_id: 'MXN',
                    },
                ],
                payer: {
                    email: email || 'comercio@senda.app',
                },
                external_reference: commerceId, // Guardamos el ID del comercio para identificarlo en el Webhook
                back_urls: {
                    success: 'https://senda-api-575148645093.us-central1.run.app/success',
                    failure: 'https://senda-api-575148645093.us-central1.run.app/failure',
                    pending: 'https://senda-api-575148645093.us-central1.run.app/pending',
                },
                auto_return: 'approved',
            },
        });
        return res.status(200).json({
            success: true,
            init_point: result.init_point, // Este es el link de pago que enviaremos al cliente/comercio
            sandbox_init_point: result.sandbox_init_point,
        });
    }
    catch (error) {
        console.error('Error al crear la preferencia de Mercado Pago:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al generar el link de pago',
            error: error.message
        });
    }
});
export default router;
