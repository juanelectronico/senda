// src/routes/whatsapp.routes.ts
import { Router } from 'express';
import { getFormattedCode, getCodeWithType, getSessionStatus, startWhatsAppBotForCommerce } from '../services/whatsapp.service';
const router = Router();
/**
 * GET /api/whatsapp/get-qr
 * Obtiene el QR o pairing code para un comercio específico
 */
router.get('/get-qr', async (req, res) => {
    try {
        const { id } = req.query;
        // Validar que venga el ID
        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }
        console.log(`📡 [${id}] Consultando QR...`);
        // Obtener el estado de la sesión
        const status = getSessionStatus(id);
        // Obtener el código con tipo
        const codeInfo = getCodeWithType(id);
        // Si ya está conectado
        if (status.exists && !status.isPairing && !codeInfo.code) {
            return res.json({
                success: true,
                status: 'connected',
                message: 'WhatsApp ya está conectado'
            });
        }
        // Si tenemos código QR o pairing code
        if (codeInfo.code) {
            // Formatear el código si es pairing
            const formattedCode = codeInfo.type === 'pairing'
                ? getFormattedCode(id)
                : codeInfo.code;
            return res.json({
                success: true,
                qr: formattedCode,
                type: codeInfo.type, // 'pairing' o 'qr'
                status: 'pending',
                isPairing: codeInfo.type === 'pairing'
            });
        }
        // Si está en proceso de emparejamiento
        if (status.isPairing) {
            return res.json({
                success: true,
                status: 'pairing',
                message: 'Generando código de vinculación...'
            });
        }
        // Sin QR aún
        return res.json({
            success: true,
            status: 'waiting',
            message: 'Esperando generación del código...'
        });
    }
    catch (error) {
        console.error('❌ Error en get-qr:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});
/**
 * POST /api/whatsapp/connect
 * Inicia la conexión de WhatsApp para un comercio
 */
router.post('/connect', async (req, res) => {
    try {
        const { id, phone } = req.body;
        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }
        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Número de teléfono es requerido'
            });
        }
        console.log(`📱 [${id}] Iniciando conexión con teléfono: ${phone}`);
        // Iniciar el proceso de conexión
        const result = await startWhatsAppBotForCommerce(id, phone);
        return res.json({
            success: true,
            message: 'Conexión iniciada',
            qr: result !== 'ALREADY_AUTHENTICATED' ? result : null,
            authenticated: result === 'ALREADY_AUTHENTICATED'
        });
    }
    catch (error) {
        console.error('❌ Error en connect:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Error al conectar'
        });
    }
});
/**
 * GET /api/whatsapp/status
 * Obtiene el estado actual de la conexión
 */
router.get('/status', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }
        const status = getSessionStatus(id);
        const codeInfo = getCodeWithType(id);
        return res.json({
            success: true,
            data: {
                exists: status.exists,
                isPairing: status.isPairing,
                hasCode: status.hasCode,
                createdAt: status.createdAt,
                codeType: codeInfo.type,
                hasCodeValue: !!codeInfo.code
            }
        });
    }
    catch (error) {
        console.error('❌ Error en status:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});
export default router;
