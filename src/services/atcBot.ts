import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode-terminal";

dotenv.config();

// Inicializar Supabase
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

let sock: any = null;
let qrCode: string | null = null;

export async function startATCBot() {
    console.log("🤖 Iniciando bot de WhatsApp ATC...");

    try {
        const { state, saveCreds } = await useMultiFileAuthState("sessions/atc_session");
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            generateHighQualityLink: true,
            browser: ["Senda ATC", "Chrome", "1.0.0"]
        });

        sock.ev.on("connection.update", async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCode = qr;
                console.log("📱 Escanea el código QR con WhatsApp:");
                QRCode.generate(qr, { small: true });
                console.log("🔄 QR generado. Esperando escaneo...");
            }

            if (connection === "close") {
                const shouldReconnect = true;
                console.log(`📴 Conexión cerrada. Reconectar: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    console.log("🔄 Intentando reconectar...");
                    setTimeout(() => startATCBot(), 5000);
                } else {
                    console.log("❌ Sesión cerrada. Escanea el QR nuevamente.");
                }
            }

            if (connection === "open") {
                console.log("✅ Bot ATC conectado exitosamente!");
                qrCode = null;
            }
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("messages.upsert", async (messageUpdate: any) => {
            try {
                const msg = messageUpdate.messages[0];
                if (!msg?.message) return;

                const from = msg.key.remoteJid;
                const messageContent = msg.message.conversation || 
                                      msg.message.extendedTextMessage?.text || 
                                      msg.message.imageMessage?.caption || 
                                      "";

                if (!from || !messageContent) return;

                console.log(`📩 Mensaje de ${from}: ${messageContent}`);

                const normalizedPhone = from.replace(/@s\.whatsapp\.net$/, "");
                
                const { data: commerce, error } = await supabase
                    .from("commerce")
                    .select("*")
                    .eq("phone", normalizedPhone)
                    .single();

                if (error || !commerce) {
                    console.log(`⚠️ Número no registrado: ${normalizedPhone}`);
                    await sock.sendMessage(from, { 
                        text: "❌ Este número no está registrado en Senda. Por favor, regístrate primero."
                    });
                    return;
                }

                await processMessage(from, messageContent, commerce);

            } catch (error) {
                console.error("❌ Error procesando mensaje:", error);
            }
        });

        return sock;

    } catch (error) {
        console.error("❌ Error iniciando bot ATC:", error);
        return null;
    }
}

async function processMessage(from: string, message: string, commerce: any) {
    try {
        const { data: session, error } = await supabase
            .from("chatsession")
            .select("*")
            .eq("commerce_phone", commerce.phone)
            .eq("status", "ACTIVE")
            .single();

        const flowState = session?.flow_state || "IDLE";

        if (message.toLowerCase() === "factura" || message.toLowerCase() === "facturar") {
            if (!commerce.is_active) {
                await sock.sendMessage(from, { 
                    text: "⛔ Tu cuenta no está activa. Realiza el pago para activarla."
                });
                return;
            }

            if (!commerce.is_premium && commerce.invoice_count >= 5) {
                await sock.sendMessage(from, { 
                    text: `⚠️ Has usado tus ${commerce.invoice_count} facturas gratuitas.\n` +
                          "💰 Adquiere el plan Beta por $50 MXN para continuar.\n" +
                          "📩 En breve te enviaremos el link de pago."
                });
                return;
            }

            await supabase
                .from("chatsession")
                .insert({
                    commerce_phone: commerce.phone,
                    status: "ACTIVE",
                    flow_state: "WAITING_CLIENT_DATA",
                    created_at: new Date().toISOString()
                });

            await sock.sendMessage(from, { 
                text: "📋 Envía los datos del cliente para facturar:\n" +
                      "RFC, Nombre o Razón Social, Correo electrónico, Monto, Concepto"
            });
            return;
        }

        if (message.toLowerCase() === "confirmar") {
            await sock.sendMessage(from, { 
                text: "✅ Factura confirmada. Generando CFDI..."
            });
            return;
        }

        if (message.toLowerCase() === "rechazar") {
            await sock.sendMessage(from, { 
                text: "❌ Factura rechazada."
            });
            await supabase
                .from("chatsession")
                .update({ status: "INACTIVE", flow_state: "IDLE" })
                .eq("id", session?.id);
            return;
        }

        if (session && flowState === "WAITING_CLIENT_DATA") {
            await sock.sendMessage(from, { 
                text: "✅ Datos recibidos. Esperando confirmación para timbrar la factura."
            });
            await supabase
                .from("chatsession")
                .update({ flow_state: "WAITING_CONFIRMATION" })
                .eq("id", session.id);
            return;
        }

        if (flowState === "IDLE" || !session) {
            await sock.sendMessage(from, { 
                text: "👋 ¡Hola! Soy Senda, tu asistente de facturación.\n\n" +
                      "Comandos disponibles:\n" +
                      "📄 *factura* - Iniciar una nueva factura\n" +
                      "📊 *estado* - Ver estado de tu cuenta\n" +
                      "💰 *pagar* - Obtener link de pago"
            });
        }

    } catch (error) {
        console.error("❌ Error en processMessage:", error);
        await sock.sendMessage(from, { 
            text: "❌ Ocurrió un error. Por favor, intenta de nuevo."
        });
    }
}

export function getQRCode() {
    return qrCode;
}