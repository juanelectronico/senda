// src/features/fiscal/services/merchantNotifier.ts
export class MerchantNotifier {
    async notifyNewInvoice(invoice) {
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
        }
        catch (error) {
            console.error('Error notificando al comercio:', error);
        }
    }
    async notifyMerchantConfirmation(invoiceId) {
        console.log(`✅ Factura ${invoiceId} confirmada por el comercio`);
        // Aquí irá la lógica de confirmación
    }
    async notifyMerchantRejection(invoiceId, reason) {
        console.log(`❌ Factura ${invoiceId} rechazada. Motivo: ${reason}`);
        // Aquí irá la lógica de rechazo
    }
}
