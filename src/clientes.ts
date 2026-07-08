import { Request, Response } from 'express';
import { CustomerService } from './services/customer.service';

export async function createCustomer(req: Request, res: Response) {
  try {
    const { rfc, razonSocial, email, commerceId } = req.body;

    // Validación básica
    if (!rfc || !razonSocial || !email || !commerceId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Faltan campos obligatorios (rfc, razonSocial, email, commerceId)' 
      });
    }

    const newCustomer = await CustomerService.createCustomer({
      rfc,
      razonSocial,
      email,
      commerceId,
    });

    return res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error('❌ Error al crear cliente:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}