import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

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

    // Guardar en Supabase
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
      console.error('Error al guardar:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    // Éxito con return agregado
    return res.json({
      success: true,
      message: '✅ ¡Registro exitoso! Ya puedes comenzar a facturar con Senda desde WhatsApp.',
      commerce: {
        id: data.id,
        business_name: data.business_name,
        phone: data.phone
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    // Return agregado aquí también
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

export default router;