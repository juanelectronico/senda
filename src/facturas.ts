import { Router, Request, Response } from 'express';
import { InvoiceService } from './services/invoice.service';

const router = Router();

/**
 * Obtener todas las facturas (GET /api/invoices)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const facturas = await InvoiceService.listInvoices();
    return res.status(200).json({
      success: true,
      data: facturas
    });
  } catch (error: any) {
    console.error('❌ Error al obtener facturas:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Crear una nueva factura en borrador (POST /api/invoices)
 * Ajustado a tu esquema Prisma (solo pide customerId y amount)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { customerId, amount } = req.body;
    
    if (!customerId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos requeridos: customerId o amount."
      });
    }

    const nuevaFactura = await InvoiceService.createInvoice({ customerId, amount });
    
    return res.status(201).json({
      success: true,
      message: "Factura creada en borrador con éxito.",
      data: nuevaFactura
    });
  } catch (error: any) {
    console.error('❌ Error al crear factura:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Validar datos fiscales del cliente y preparar para timbrado (PUT /api/invoices/:id/ready)
 */
router.put('/:id/ready', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const facturaPreparada = await InvoiceService.prepareForStamping(id as string);
    
    return res.status(200).json({
      success: true,
      message: "Factura validada y preparada con éxito para el timbrado.",
      data: facturaPreparada
    });
  } catch (error: any) {
    console.error('❌ Error al preparar factura:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Timbrar factura de forma oficial en Facturapi (POST /api/invoices/:id/stamp)
 */
router.post('/:id/stamp', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const facturaTimbrada = await InvoiceService.stampInvoice(id as string);
    
    return res.status(200).json({
      success: true,
      message: "¡Factura timbrada con éxito en el SAT de prueba!",
      data: facturaTimbrada
    });
  } catch (error: any) {
    console.error('❌ Error en proceso de timbrado:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ESTA LÍNEA EXPORTA EL MÓDULO CORRECTAMENTE PARA INDEX.TS:
export default router;