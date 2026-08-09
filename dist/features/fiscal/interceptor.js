// src/features/fiscal/interceptor.ts
import { FiscalFlow } from './flows/fiscalFlow';
import { ConversationStateManager } from './services/stateManager';
import { FiscalValidator } from './services/validator';
import { GeminiExtractor } from './services/geminiExtractor';
import { InvoiceRepository } from './repository/invoiceRepository';
import { FacturapiClient } from './integrations/facturapi';
import { MerchantNotifier } from './services/merchantNotifier';
export class FiscalInterceptor {
    fiscalFlow;
    isActive;
    testUsers;
    constructor() {
        // Inicializar el nuevo flujo (independiente)
        this.fiscalFlow = new FiscalFlow(new ConversationStateManager(), new FiscalValidator(), new MerchantNotifier(), new InvoiceRepository(), new FacturapiClient(), new GeminiExtractor());
        // Configuración segura
        this.isActive = process.env.FISCAL_FEATURE_ACTIVE === 'true';
        this.testUsers = (process.env.FISCAL_TEST_USERS || '').split(',').filter(Boolean);
        console.log('📋 Interceptor fiscal inicializado');
        console.log(`   Activo: ${this.isActive}`);
        console.log(`   Usuarios de prueba: ${this.testUsers.length > 0 ? this.testUsers.join(', ') : 'ninguno'}`);
    }
    async intercept(message, userId) {
        try {
            // SEGURIDAD 1: Verificar si la función está activa
            if (!this.isActive) {
                console.log('🔒 Función fiscal desactivada');
                return null; // No hacer nada
            }
            // SEGURIDAD 2: Verificar si el usuario está en la lista de prueba
            const isTestUser = this.testUsers.includes(userId);
            const isProduction = process.env.NODE_ENV === 'production';
            if (isProduction && !isTestUser) {
                console.log(`🔒 Usuario ${userId} no está en lista de prueba`);
                return null; // No hacer nada en producción si no es usuario de prueba
            }
            // SEGURIDAD 3: Verificar si el mensaje es sobre factura
            if (!this.isInvoiceIntent(message)) {
                return null; // No es factura, dejar pasar
            }
            console.log(`🚀 Procesando factura para usuario: ${userId}`);
            // SEGURIDAD 4: Ejecutar el nuevo flujo con try-catch
            try {
                const response = await this.fiscalFlow.execute(userId, message);
                return response;
            }
            catch (flowError) {
                console.error('❌ Error en flujo fiscal:', flowError);
                return null; // Si falla, no interrumpir el sistema
            }
        }
        catch (error) {
            // SEGURIDAD 5: Si todo falla, no hacer nada
            console.error('❌ Error en interceptor fiscal:', error);
            return null;
        }
    }
    isInvoiceIntent(message) {
        const keywords = ['factura', 'cfdi', 'facturar', 'mi factura', 'necesito factura', 'quiero factura'];
        const lowerMessage = message.toLowerCase();
        return keywords.some(keyword => lowerMessage.includes(keyword));
    }
}
