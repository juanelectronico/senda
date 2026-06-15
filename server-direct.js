require('dotenv').config();
const express = require('express');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K6pX_WHhQkc9NZEG-GH4Ytprw13x9kXX0tFtYCt2N0wQ';

// ========== RUTAS DE FACTURACIÓN ==========

// Formulario de facturación (GET)
app.get('/factura/:commerceId', (req, res) => {
    const { commerceId } = req.params;
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Facturación Senda</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h2 { color: #333; margin-bottom: 20px; text-align: center; }
                input, select { width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
                button { width: 100%; padding: 12px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
                button:hover { background-color: #0056b3; }
                .error { color: red; text-align: center; margin-top: 10px; }
                .success { color: green; text-align: center; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📄 Datos de Facturación</h2>
                <form action="/factura/${commerceId}" method="POST">
                    <input type="text" name="rfc" placeholder="RFC" required>
                    <input type="text" name="razonSocial" placeholder="Razón Social" required>
                    <input type="text" name="regimenFiscal" placeholder="Régimen Fiscal" required>
                    <input type="text" name="usoCfdi" placeholder="Uso CFDI" required>
                    <input type="text" name="codigoPostal" placeholder="Código Postal" required>
                    <input type="email" name="email" placeholder="Correo Electrónico" required>
                    <button type="submit">📨 Generar Factura</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// Procesar formulario de facturación (POST)
app.post('/factura/:commerceId', async (req, res) => {
    const { commerceId } = req.params;
    const { rfc, razonSocial, regimenFiscal, usoCfdi, codigoPostal, email } = req.body;
    
    try {
        // Validar que llegaron los datos
        if (!rfc || !razonSocial || !regimenFiscal || !usoCfdi || !codigoPostal || !email) {
            throw new Error('Faltan datos requeridos');
        }

        // Aquí puedes agregar la integración con Supabase después
        // const { supabase } = require('./config/supabase');
        // await supabase.from('Invoice').insert([{...}]);

        console.log('📋 Datos de facturación recibidos:', { commerceId, rfc, razonSocial, email });
        
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Facturación Senda - Éxito</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                    .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
                    h2 { color: #28a745; margin-bottom: 20px; }
                    p { margin: 10px 0; text-align: left; }
                    .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left; }
                    a { display: inline-block; margin-top: 20px; color: #007bff; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>✅ ¡Datos Recibidos!</h2>
                    <p>Factura en proceso de generación para <strong>${commerceId}</strong></p>
                    <div class="info">
                        <p><strong>RFC:</strong> ${rfc}</p>
                        <p><strong>Razón Social:</strong> ${razonSocial}</p>
                        <p><strong>Régimen Fiscal:</strong> ${regimenFiscal}</p>
                        <p><strong>Uso CFDI:</strong> ${usoCfdi}</p>
                        <p><strong>Código Postal:</strong> ${codigoPostal}</p>
                        <p><strong>Email:</strong> ${email}</p>
                    </div>
                    <a href="/factura/${commerceId}">← Volver al formulario</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('❌ Error al procesar factura:', err.message);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Facturación Senda - Error</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                    .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
                    h2 { color: #dc3545; margin-bottom: 20px; }
                    a { display: inline-block; margin-top: 20px; color: #007bff; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>❌ Error</h2>
                    <p>${err.message}</p>
                    <a href="/factura/${commerceId}">← Intentar nuevamente</a>
                </div>
            </body>
            </html>
        `);
    }
});

// ========== CHAT-BOT ==========
app.post('/api/chat-bot', async (req, res) => {
    try {
        const { mensaje } = req.body;
        console.log('📨 Mensaje recibido:', mensaje);
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const data = JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: `Eres Senda Bot, un asistente virtual de facturación. Ayudas a los clientes con sus facturas. El cliente dice: "${mensaje}". Responde de manera amable y útil. Si el cliente no proporciona su RFC, pregúntaselo amablemente para poder ayudarle con su facturación.` }
                    ]
                }
            ]
        });
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const request = https.request(url, options, (response) => {
            let body = '';
            response.on('data', (chunk) => body += chunk);
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const respuesta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || 'Lo siento, no pude procesar tu solicitud.';
                    console.log('✅ Respuesta enviada');
                    res.json({ respuesta: respuesta });
                } catch (err) {
                    console.error('❌ Error al parsear respuesta:', err.message);
                    res.status(500).json({ error: err.message });
                }
            });
        });
        
        request.on('error', (err) => {
            console.error('❌ Error en la solicitud:', err.message);
            res.status(500).json({ error: err.message });
        });
        
        request.write(data);
        request.end();
        
    } catch (err) {
        console.error('❌ Error general:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Ruta de prueba para verificar que el servidor funciona
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
app.listen(3000, () => {
    console.log('🚀 Senda corriendo en http://localhost:3000');
    console.log('📋 Formulario: http://localhost:3000/factura/tienda_juan');
    console.log('💬 Chat-bot: POST /api/chat-bot');
});