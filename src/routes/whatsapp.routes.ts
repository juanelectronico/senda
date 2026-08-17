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
        const { id, phone } = req.query;

        if (!id || typeof id !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ID de comercio es requerido'
            });
        }

        const targetPhone = (phone && typeof phone === 'string') ? phone : '525670500038';
        const status = getSessionStatus(id);
        const codeInfo = getCodeWithType(id);

        // Si no hay sesión ni código, arrancamos el bot automáticamente de inmediato
        if (!status.exists && !codeInfo.code) {
            console.log(`🔄 [${id}] Sesión limpia detectada en get-qr. Auto-iniciando bot con teléfono: ${targetPhone}`);
            
            // Disparamos el inicio de forma asíncrona para no congelar la respuesta
            startWhatsAppBotForCommerce(id, targetPhone).catch(err => {
                console.error(`❌ [${id}] Error en auto-inicio:`, err.message);
            });

            return res.json({
                success: true,
                status: 'pairing',
                message: 'Iniciando sesión de WhatsApp automáticamente, recarga en unos segundos...'
            });
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

        return res.json({
            success: true,
            status: 'pairing',
            message: 'Generando código de vinculación...'
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
        if (!id) return res.status(400).json({ success: false, error: 'ID requerido' });
        
        const targetPhone = phone || '525670500038';
        const result = await startWhatsAppBotForCommerce(id, targetPhone);

        return res.json({
            success: true,
            message: 'Conexión iniciada',
            qr: result !== 'ALREADY_AUTHENTICATED' ? result : null,
            authenticated: result === 'ALREADY_AUTHENTICATED'
        });
    } catch (error) {
        console.error('❌ Error en connect:', error);
        return res.status(500).json({ success: false, error: 'Error al conectar' });
    }
});

/**
 * GET /api/whatsapp/status
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ success: false, error: 'ID requerido' });
        }
        const status = getSessionStatus(id);
        const codeInfo = getCodeWithType(id);
        return res.json({ success: true, data: { exists: status.exists, hasCode: !!codeInfo.code } });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

export default router;