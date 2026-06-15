const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Simulación de "Base de Datos" temporal para probar hoy rápido
const NUMERO_DUEÑO_COMERCIO = 'whatsapp:+5215670500038'; // Pon aquí tu número para las pruebas

app.post('/webhook', async (req, res) => {
    const twiml = new MessagingResponse();
    
    // 1. Capturar los datos que nos manda Twilio
    const mensajeRecibido = req.body.Body.trim();
    const numeroQuienEscribe = req.body.From; // De quién viene (Cliente o Dueño)
    const numeroDondeLlego = req.body.To;    // A qué WhatsApp de negocio llegó

    console.log(`\n📱 Mensaje de ${numeroQuienEscribe}: "${mensajeRecibido}"`);

    // 2. LÓGICA DE DETECCIÓN: ¿Quién está hablando?
    if (numeroQuienEscribe === NUMERO_DUEÑO_COMERCIO) {
        
        // --- FLUJO DEL COMERCIO (DUEÑO) ---
        if (mensajeRecibido === '1') {
            twiml.message('✅ ¡Perfecto! Factura aprobada y timbrada con éxito. Enviando archivos al cliente...');
            console.log('📢 El comercio aprobó la factura.');
        } else if (mensajeRecibido === '2') {
            twiml.message('❌ Factura rechazada y cancelada.');
            console.log('📢 El comercio rechazó la factura.');
        } else {
            twiml.message('Senda Admin 🤖: Responde "1" para aprobar la factura pendiente o "2" para rechazarla.');
        }

    } else {
        
        // --- FLUJO DEL CLIENTE FINAL ---
        twiml.message(`¡Hola! Recibimos tu solicitud para facturar en este comercio. 🧾\n\nPor favor, responde a este mensaje únicamente con tu **RFC** para comenzar.`);
        
        // Aquí mandaríamos la alerta al dueño en automático (lo programaremos enseguida)
        console.log(`📢 Cliente solicitando factura. Avisando al dueño...`);
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
});

app.listen(3000, () => {
    console.log('🚀 Servidor de Senda escuchando en el puerto 3000');
});