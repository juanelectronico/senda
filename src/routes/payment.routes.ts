import { Router } from 'express';
import { crearPreferenciaPago } from '../services/payment.service';

const router = Router();

router.post('/create-preference', async (req, res) => {
    try {
        const { commerceId, email } = req.body;
        const preference = await crearPreferenciaPago(commerceId, email);
        res.json({ init_point: preference.init_point });
    } catch (error) {
        console.error('Error al crear preferencia:', error);
        res.status(500).json({ error: 'Error al generar el link de pago' });
    }
});

export default router;