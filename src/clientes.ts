import { Request, Response } from 'express';
import { CustomerService } from './services/customer.service';

/**
 * GET /api/customers
 * Listar todos los clientes
 */
export async function getCustomers(req: Request, res: Response) {
  try {
    const customers = await CustomerService.listCustomers();
    res.json(customers);
  } catch (error: any) {
    console.error('❌ Error al obtener clientes:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}

/**
 * POST /api/customers
 * Crear un nuevo cliente
 */
export async function createCustomer(req: Request, res: Response) {
  try {
    const { rfc, razonSocial, email, commerceId } = req.body;

    if (!rfc || !razonSocial || !email || !commerceId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios (rfc, razonSocial, email, commerceId)',
      });
    }

    const newCustomer = await CustomerService.createCustomer({
      rfc,
      razonSocial,
      email,
      commerceId,
    });

    res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error('❌ Error al crear cliente:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}