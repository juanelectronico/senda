import { MercadoPagoConfig, Preference } from 'mercadopago';

// Esto usa tu Access Token de producción que acabamos de configurar en .env
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN || '' 
});

export const crearPreferenciaPago = async (commerceId: string, email: string) => {
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
                success: 'https://tusenda.com/success',
                failure: 'https://tusenda.com/failure'
            },
            external_reference: commerceId, 
            auto_return: 'approved'
        }
    });
};