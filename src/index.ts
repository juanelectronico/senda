import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { supabase } from './config/supabase';
import { VertexAI } from '@google-cloud/vertexai';
import { MercadoPagoConfig, Preference } from 'mercadopago';

// Configura tu cliente de Mercado Pago con tu Access Token del archivo .env
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });

const app = express();

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
app.use(express.static(publicDir));

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(publicDir, 'register.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(publicDir, 'register.html'));
});

// Configuración de Vertex AI
const project = process.env.GOOGLE_CLOUD_PROJECT || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertexAI = new VertexAI({ project, location });
const modelName = `projects/${project}/locations/${location}/publishers/google/models/gemini-1.5-flash`;
const model = vertexAI.preview.getGenerativeModel({ model: modelName });

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

    // Crear la preferencia de pago en Mercado Pago por $50.00 MXN
    let initPoint = null;
    try {
      const preference = new Preference(mpClient);
      const resultMP = await preference.create({
        body: {
          items: [
            {
              title: 'Alta de Comercio y Suscripción Senda',
              quantity: 1,
              unit_price: 50.00
            }
          ],
          payer: { email },
          back_urls: {
            success: 'http://localhost:3000/register.html?status=success',
            failure: 'http://localhost:3000/register.html?status=failure',
            pending: 'http://localhost:3000/register.html?status=pending'
          }
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

// --- ENDPOINT DEL CHAT-BOT ---
app.post('/api/chat-bot', async (req: any, res: any) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje) {
      return res.status(400).json({ respuesta: 'Por favor, escribe un mensaje.' });
    }

    const prompt = `Eres Senda Bot, un asistente virtual experto en facturación electrónica en México (SAT), alta de comercios y vinculación con WhatsApp. Responde de forma amable, clara y concisa a la siguiente duda del usuario: "${mensaje}"`;
    
    const chatResult = await model.generateContent(prompt);
    const responseText = chatResult.response.text();

    return res.json({ respuesta: responseText });
  } catch (error: any) {
    console.error('Error en Senda Bot:', error);
    return res.status(500).json({ respuesta: 'Lo siento, tuve un problema procesando tu consulta en este momento.' });
  }
});

console.log('✅ Senda API lista');

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Senda corriendo en http://localhost:${PORT}`));