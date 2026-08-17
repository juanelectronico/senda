// src/routes/whatsapp.routes.ts
import { Router, Request, Response } from 'express';
import { 
    getFormattedCode, 
    getCodeWithType, 
    getSessionStatus,
    startWhatsAppBotForCommerce 
} from '../services/whatsapp.service';

const router = Router();

/**
 * GET /api/whatsapp/get-qr
 * Obtiene el QR o pairing code para un comercio específico
 */
router.get('/get-qr', async (req: Request, res: Response) => {
    try {
        const { id } = req.query;

        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }

        console.log(`📡 [${id}] Consultando QR...`);

        let status = getSessionStatus(id);
        let codeInfo = getCodeWithType(id);

            if (commerce?.phone) {
                console.log(`🚀 [${id}] Teléfono encontrado (${commerce.phone}). Auto-iniciando bot...`);
                // Llamamos a start en segundo plano o esperamos a que genere el código
                startWhatsAppBotForCommerce(id, commerce.phone, false).catch(err => {
                    console.error(`❌ [${id}] Error auto-iniciando en get-qr:`, err);
                });
                
                return res.json({
                    success: true,
                    status: 'pairing',
                    message: 'Iniciando conexión de WhatsApp...'
                });
            }
        }

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
            const formattedCode = codeInfo.type === 'pairing' 
                ? getFormattedCode(id) 
                : codeInfo.code;

            return res.json({
                success: true,
                qr: formattedCode,
                type: codeInfo.type,
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

        return res.json({
            success: true,
            status: 'waiting',
            message: 'Esperando generación del código...'
        });

    } catch (error) {
        console.error('❌ Error en get-qr:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

/**
 * POST /api/whatsapp/connect
 */
router.post('/connect', async (req: Request, res: Response) => {
    try {
        const { id, phone } = req.body;

        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'ID de comercio es requerido' });
        }

        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({ success: false, error: 'Número de teléfono es requerido' });
        }

        console.log(`📱 [${id}] Iniciando conexión con teléfono: ${phone}`);
        const result = await startWhatsAppBotForCommerce(id, phone);

        return res.json({
            success: true,
            message: 'Conexión iniciada',
            qr: result !== 'ALREADY_AUTHENTICATED' ? result : null,
            authenticated: result === 'ALREADY_AUTHENTICATED'
        });

    } catch (error) {
        console.error('❌ Error en connect:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Error al conectar'
        });
    }
});

/**
 * GET /api/whatsapp/status
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const { id } = req.query;

        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'ID de comercio es requerido' });
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

    } catch (error) {
        console.error('❌ Error en status:', error);
        return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

export default router;