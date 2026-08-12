import { MercadoPagoConfig, Preference } from 'mercadopago';
// Esto usa tu Access Token de producción que acabamos de configurar en .env
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || ''
});
export const crearPreferenciaPago = async (commerceId, email) => {
    const preference = new Preference(client);
    return await preference.create({
        body: {
            items: [{
                    id: 'plan_beta',
                    title: 'Senda - Plan Beta (50 MXN)',
                    quantity: 1,
                    unit_price: 50,
                    currency_id: 'MXN',
                }],
            payer: { email: email },
            // Estas URLs deberán actualizarse cuando tengas tu dominio público
            back_urls: {
                success: 'http://localhost:8080/payment/success',
                failure: 'http://localhost:8080/payment/failure'
            },
            external_reference: commerceId,
            auto_return: 'approved'
        }
    });
};
