// 1. Importamos las librerías correctas (Sin Express ni Twilio)
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 2. Inicializamos Gemini con la clave de tu .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 3. Configuración de WhatsApp con guardado de sesión local
const client = new Client({
    authStrategy: new LocalAuth()
});

// Simulación de "Base de Datos" para tus pruebas
const NUMERO_DUEÑO_COMERCIO = '5215670500038@c.us'; // Formato de ID de WhatsApp para el dueño

// Mostrar el código QR en la consola para escanear
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📸 Escanea el código QR de arriba con tu WhatsApp para conectar Senda.');
});

client.on('ready', () => {
    console.log('🚀 ¡Senda Bot está conectado y listo en WhatsApp!');
});

// 4. LÓGICA PRINCIPAL: Cuando llega un mensaje
client.on('message', async (msg) => {
    const mensajeRecibido = msg.body.trim();
    const numeroQuienEscribe = msg.from; // ID de WhatsApp de quien envía

    console.log(`\n📱 Mensaje de ${numeroQuienEscribe}: "${mensajeRecibido}"`);

    // ¿Quién está hablando?
    if (numeroQuienEscribe === NUMERO_DUEÑO_COMERCIO) {
        
        // --- FLUJO DEL COMERCIO (DUEÑO) ---
        if (mensajeRecibido === '1') {
            await msg.reply('✅ ¡Perfecto! Factura aprobada y timbrada con éxito. Enviando archivos al cliente...');
            console.log('📢 El comercio aprobó la factura.');
        } else if (mensajeRecibido === '2') {
            await msg.reply('❌ Factura rechazada y cancelada.');
            console.log('📢 El comercio rechazó la factura.');
        } else {
            await msg.reply('Senda Admin 🤖: Responde "1" para aprobar la factura pendiente o "2" para rechazarla.');
        }

    } else {
        
        // --- FLUJO DEL CLIENTE FINAL CON GEMINI ---
        console.log(`📢 Analizando mensaje del cliente con Gemini...`);
        
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            // Contexto para que Gemini sepa qué responder en WhatsApp
            const promptAsistente = `Eres Senda Bot, un asistente virtual de facturación automática para un comercio. 
            El cliente te acaba de escribir: "${mensajeRecibido}". 
            Si te está saludando o haciendo una pregunta general, respóndele de forma amable, muy corta (máximo 2 párrafos) y recuérdale que para comenzar a facturar necesita proporcionar su RFC.`;

            const result = await model.generateContent(promptAsistente);
            const respuestaIA = result.response.text();

            // Responder directamente al cliente en WhatsApp
            await msg.reply(respuestaIA);

        } catch (error) {
            console.error("❌ Error con Gemini:", error);
            // Mensaje de respaldo si falla la API
            await msg.reply(`¡Hola! Recibimos tu solicitud para facturar. 🧾\n\nPor favor, responde a este mensaje únicamente con tu **RFC** para comenzar.`);
        }
        
        console.log(`📢 Cliente atendido por la IA.`);
    }
});

// Arrancar el cliente de WhatsApp
client.initialize();