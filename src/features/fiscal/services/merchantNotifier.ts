// src/features/fiscal/services/merchantNotifier.ts

import { Invoice } from '../types';

export class MerchantNotifier {
  async notifyNewInvoice(invoice: Invoice): Promise<void> {
    try {
      // TODO: Aquí se implementará la notificación al comercio
      // Por ahora solo mostramos en consola
      console.log('📨 Notificando al comercio:', {
        invoiceId: invoice.id,
        cliente: invoice.fiscalData.razonSocial,
        rfc: invoice.fiscalData.rfc,
        monto: invoice.monto || 0,
        status: invoice.status
      });

      // Aquí irá la lógica para enviar mensaje por WhatsApp al comercio
      // Ejemplo:
      // await this.whatsappClient.sendMessage({
      //   to: process.env.MERCHANT_WHATSAPP_NUMBER,
      //   text: `Nueva factura pendiente: ${invoice.fiscalData.razonSocial}`
      // });
      
    } catch (error) {
      console.error('Error notificando al comercio:', error);
    }
  }

  async notifyMerchantConfirmation(invoiceId: string): Promise<void> {
    console.log(`✅ Factura ${invoiceId} confirmada por el comercio`);
    // Aquí irá la lógica de confirmación
  }

  async notifyMerchantRejection(invoiceId: string, reason: string): Promise<void> {
    console.log(`❌ Factura ${invoiceId} rechazada. Motivo: ${reason}`);
    // Aquí irá la lógica de rechazo
  }
}