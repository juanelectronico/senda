import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { supabase } from './config/supabase';
import { VertexAI } from '@google-cloud/vertexai';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

// --- IMPORTACIÓN DE NUESTROS MÓDULOS DE WHATSAPP (ATCBOT Y PAIRING) ---
import { conectarATCSenda, enviarMensajeDesdeATC } from './services/atcBot';
import { generarPairingCodeParaComercio } from './services/pairingService';

// ============================================
// LOGS DE DIAGNÓSTICO PARA RAILWAY / CLOUD RUN
// ============================================
console.log('🔍 [1] Iniciando aplicación...');
console.log('🔍 [2] NODE_ENV:', process.env.NODE_ENV || 'no definido');
console.log('🔍 [3] PORT:', process.env.PORT || 'no definido');
console.log('🔍 [4] SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configurada' : '❌ No configurada');
console.log('🔍 [5] MP_ACCESS_TOKEN:', process.env.MP_ACCESS_TOKEN ? '✅ Configurado' : '❌ No configurado');
console.log('🔍 [6] GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT ? '✅ Configurado' : '❌ No configurado');
console.log('🔍 [7] Directorio actual:', process.cwd());
console.log('========================================');

// Configura tu cliente de Mercado Pago con tu Access Token del archivo .env
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });

const app = express();

console.log('🔍 [8] Configurando middlewares...');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- 1. MIDDLEWARE DE DIAGNÓSTICO ---
app.use((req, res, next) => {
    console.log(`[LOG]: Petición recibida -> ${req.method} ${req.path}`);
    next();
});

// --- 2. SERVIDOR DE ARCHIVOS ESTÁTICOS Y RUTAS FRONTEND ---
const publicDir = path.join(process.cwd(), 'public');
console.log('🔍 [9] Directorio público:', publicDir);
app.use(express.static(publicDir));

// Redirección de la raíz al formulario de registro para evitar errores 404
app.get('/', (req, res) => {
    res.redirect('/register.html');
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'register.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(publicDir, 'register.html'));
});

console.log('🔍 [10] Configurando Vertex AI...');

// Configuración de Vertex AI
const project = process.env.GOOGLE_CLOUD_PROJECT || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertexAI = new VertexAI({ project, location });
const modelName = `projects/${project}/locations/${location}/publishers/google/models/gemini-1.5-flash`;
const model = vertexAI.preview.getGenerativeModel({ model: modelName });

console.log('🔍 [11] Configurando endpoints...');

// --- ENDPOINT DE REGISTRO CON MERCADO PAGO ---
app.post('/api/commerce/register', async (req: any, res: any) => {
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

    if (!rfc || !business_name || !tax_regime || !zip_code || !phone || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos requeridos' 
      });
    }

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
        is_active: false, // Inicia inactivo hasta que se confirme el pago por Webhook
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

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    let initPoint = null;
    try {
      const preference = new Preference(mpClient);
      const resultMP = await preference.create({
        body: {
          items: [
            {
              id: 'subscription_alta_senda',
              title: 'Alta de Comercio y Suscripción Senda',
              quantity: 1,
              unit_price: 50.00,
              currency_id: 'MXN'
            }
          ],
          payer: { email },
          external_reference: data.id.toString(), // Vinculamos el ID del comercio para rastrearlo en el webhook
          back_urls: {
            success: `${baseUrl}/register.html?status=success`,
            failure: `${baseUrl}/register.html?status=failure`,
            pending: `${baseUrl}/register.html?status=pending`
          },
          auto_return: 'approved'
        }
      });
      initPoint = resultMP.init_point;
    } catch (mpError: any) {
      console.error('❌ Error detallado en Mercado Pago:', mpError.message || mpError);
    }

    return res.json({
      success: true,
      message: '✅ ¡Registro exitoso!',
      init_point: initPoint,
      commerce: {
        id: data.id,
        business_name: data.business_name,
        phone: data.phone
      }
    });

  } catch (error: any) {
    console.error('Error en registro:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// --- ENDPOINT WEBHOOK DE MERCADO PAGO + AUTOMATIZACIÓN WHATSAPP ---
app.post('/api/payment/webhook', async (req: any, res: any) => {
  try {
    const payment = req.body;

    if (payment.type === 'payment' || payment.action === 'payment.created' || payment.action === 'payment.updated') {
      const paymentId = payment.data?.id || payment.id;

      if (!paymentId) {
        return res.status(400).json({ success: false, error: 'ID de pago no encontrado' });
      }

      const paymentApi = new Payment(mpClient);
      const paymentInfo = await paymentApi.get({ id: paymentId });

      if (paymentInfo.status === 'approved') {
        const commerceId = paymentInfo.external_reference;

        if (commerceId) {
          console.log(`✅ ¡Pago aprobado para el comercio ID: ${commerceId}! Actualizando en Supabase...`);

          // 1. Actualizamos en Supabase trayendo los datos completos (teléfono y nombre)
          const { data: commerceData, error: updateError } = await supabase
            .from('commerce')
            .update({ 
              is_active: true,
              is_premium: true 
            })
            .eq('id', commerceId)
            .select()
            .single();

          if (updateError) {
            console.error('❌ Error al actualizar el comercio en Supabase tras el pago:', updateError);
            return res.status(500).json({ success: false, error: updateError.message });
          }

          console.log(`🚀 Comercio ${commerceId} activado exitosamente en Supabase.`);

          // 2. DISPARAMOS EL PROCESO AUTOMÁTICO DE WHATSAPP (CÓDIGO DE 8 DÍGITOS VÍA ATC)
          if (commerceData && commerceData.phone) {
            const commercePhone = commerceData.phone;
            const businessName = commerceData.business_name || 'Comercio';

            console.log(`📱 Generando código de 8 dígitos para ${businessName} (${commercePhone})...`);

            try {
              // Generamos el pairing code de 8 dígitos de forma aislada
              const pairingCode = await generarPairingCodeParaComercio(commercePhone);
              console.log(`🔑 Código obtenido con éxito: ${pairingCode}`);

              // Preparamos el mensaje instructivo oficial de Senda
              const mensajeATC = `¡Hola, *${businessName}*! 🎉 Tu pago de 50 MXN en Senda ha sido confirmado con éxito.\n\nPara vincular el WhatsApp de tu negocio y empezar a operar, sigue estos pasos:\n\n1️⃣ Abre WhatsApp Business en tu teléfono\n2️⃣ Ve a **Configuración**\n3️⃣ Selecciona **Dispositivos vinculados**\n4️⃣ Toca **Vincular dispositivo** y luego **Vincular con número de teléfono**\n\nIngresa tu código de 8 dígitos:\n🔑 *${pairingCode}*`;

              // Enviamos el mensaje utilizando el número ATC oficial de Senda
              await enviarMensajeDesdeATC(commercePhone, mensajeATC);
              console.log(`✅ ¡Mensaje con código enviado al comercio vía ATC de Senda!`);

            } catch (whatsappError: any) {
              console.error('⚠️ Advertencia: El pago se aprobó y Supabase se actualizó, pero falló el envío por WhatsApp:', whatsappError.message);
            }
          }
        }
      }
    }

    return res.status(200).json({ received: true });

  } catch (error: any) {
    console.error('❌ Error en el Webhook de Mercado Pago:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- ENDPOINT DEL CHAT-BOT ---
app.post('/api/chat-bot', async (req: any, res: any) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje) {
      return res.status(400).json({ respuesta: 'Por favor, escribe un mensaje.' });
    }

    const prompt = `Eres Senda Bot, un asistente virtual experto en facturación electrónica en México (SAT), alta de comercios y vinculación con WhatsApp. Responde de forma amable, clara y concisa a la siguiente duda del usuario: "${mensaje}"`;
    
    const chatResult = await model.generateContent(prompt);
    
    const responseCandidate = chatResult.response?.candidates?.[0];
    const responseText = responseCandidate?.content?.parts?.[0]?.text || 'Lo siento, no pude generar una respuesta.';

    return res.json({ respuesta: responseText });
  } catch (error: any) {
    console.error('Error en Senda Bot:', error);
    return res.status(500).json({ respuesta: 'Lo siento, tuve un problema procesando tu consulta en este momento.' });
  }
});

// --- HEALTH CHECK PARA CLOUD RUN / RAILWAY (OBLIGATORIO) ---
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        message: 'Senda API funcionando correctamente',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ Error global no capturado:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor',
        message: err.message || 'Error desconocido'
    });
});

console.log('🔍 [12] Iniciando servidor y conectando Bot ATC de Senda...');

// --- ARRANQUE DEL SERVIDOR (ADAPTADO CORRECTAMENTE PARA CLOUD RUN Y RAILWAY) ---
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// Iniciar servidor escuchando en 0.0.0.0 tal como exige Cloud Run
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 Senda corriendo en el puerto ${PORT}`);
    console.log(`🌐 Health check: /health`);
    console.log(`📋 Registro: /register.html`);
    console.log(`💬 Chat-bot: POST /api/chat-bot`);
    console.log(`🔄 Proceso ID: ${process.pid}`);
    console.log('========================================');

    // Inicializamos el Bot ATC de Senda con un pequeño retraso para asegurar que el puerto HTTP abra sin bloqueos de timeout
    setTimeout(() => {
        try {
            conectarATCSenda();
        } catch (atcInitError) {
            console.error('❌ Error al inicializar el Bot ATC:', atcInitError);
        }
    }, 1000);

}).on('error', (err) => {
    console.error('❌ Error al iniciar servidor:', err);
    process.exit(1);
});

// --- MANEJAR CIERRE GRACIOSO ---
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM recibido, cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT recibido, cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

export default app;