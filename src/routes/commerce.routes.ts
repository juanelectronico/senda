import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { uploadCertificate } from '../certificateService';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const router = Router();

// Configuración de Mercado Pago
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || '' 
});

// Endpoint de registro
router.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      rfc,
      business_name,
      tax_regime,
      zip_code,
      phone,
      email,
      csd_cer_base64,
      csd_key_base64,
      csd_password
    } = req.body;

    // Validar campos requeridos
    if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos requeridos' 
      });
    }

    // Solución para pruebas: limpiar si ya existe el RFC para evitar error 23505 de duplicado
    await supabase.from('commerce').delete().eq('rfc', rfc);

    // Guardar en Supabase (tabla commerce)
    const { data, error } = await supabase
      .from('commerce')
      .insert({
        rfc,
        business_name,
        tax_regime,
        zip_code,
        phone,
        email,
        csd_cer_base64: csd_cer_base64 || '',
        csd_key_base64: csd_key_base64 || '',
        csd_password: csd_password || '',
        is_active: true,
        is_premium: false,
        invoice_count: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error al guardar en Supabase:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    // Subir el certificado al bucket privado si existe
    if (csd_cer_base64) {
      try {
        const cerBuffer = Buffer.from(csd_cer_base64, 'base64');
        const fileName = `${rfc}_certificate.cer`;
        await uploadCertificate(data.id, cerBuffer, fileName);
      } catch (uploadError) {
        console.error('Aviso: No se pudo subir el archivo .cer al bucket:', uploadError);
      }
    }

    // Generar la preferencia de pago en Mercado Pago por $50.00 MXN
    let initPoint = null;
    try {
      const preference = new Preference(client);
      const resultPreference = await preference.create({
        body: {
          items: [
            {
              id: 'activation_fee',
              title: 'Activación de Facturación Automática - Senda',
              quantity: 1,
              unit_price: 50.00,
              currency_id: 'MXN'
            }
          ],
          payer: {
            email: email,
            phone: {
              number: phone
            }
          },
          back_urls: {
            success: `${req.protocol}://${req.get('host')}/success.html`,
            failure: `${req.protocol}://${req.get('host')}/register.html`,
            pending: `${req.protocol}://${req.get('host')}/register.html`
          },
          auto_return: 'approved'
        }
      });
      initPoint = resultPreference.init_point;
    } catch (mpError) {
      console.error('Error generando la preferencia de Mercado Pago:', mpError);
    }

    // Respuesta exitosa final con el link de pago
    return res.json({
      success: true,
      init_point: initPoint,
      message: '✅ ¡Registro exitoso! Completa tu pago para activar WhatsApp.',
      commerce: {
        id: data.id,
        business_name: data.business_name,
        phone: data.phone
      }
    });

  } catch (error: any) {
    console.error('Error crítico en registro:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

export default router;