// src/features/fiscal/flows/fiscalFlow.ts
import { ConversationStage } from '../types';
export class FiscalFlow {
    stateManager;
    validator;
    merchantNotifier;
    invoiceRepository;
    facturapiClient;
    geminiExtractor;
    constructor(stateManager, validator, merchantNotifier, invoiceRepository, facturapiClient, geminiExtractor) {
        this.stateManager = stateManager;
        this.validator = validator;
        this.merchantNotifier = merchantNotifier;
        this.invoiceRepository = invoiceRepository;
        this.facturapiClient = facturapiClient;
        this.geminiExtractor = geminiExtractor;
    }
    async execute(userId, message) {
        // Verificar expiración de sesión
        if (this.stateManager.isSessionExpired(userId)) {
            this.stateManager.resetState(userId);
        }
        const state = this.stateManager.getState(userId);
        switch (state.stage) {
            case ConversationStage.IDLE:
                return this.handleIdle(userId);
            case ConversationStage.WAITING_FISCAL_DATA:
                return this.handleFiscalData(userId, message);
            default:
                return "🔄 Vamos a empezar de nuevo. ¿Quieres solicitar tu factura?";
        }
    }
    async handleIdle(userId) {
        this.stateManager.updateState(userId, {
            stage: ConversationStage.WAITING_FISCAL_DATA,
            attempts: 0
        });
        return `📋 ¡Claro! Para generar tu factura CFDI, necesito:

📌 RFC:
🏢 Razón Social:
⚖️ Régimen Fiscal (ej. 601, 612):
📄 Uso CFDI (ej. G01, G03):
📮 Código Postal:
📧 Correo:

⚠️ IMPORTANTE: Envíame TODOS los datos en un SOLO mensaje.`;
    }
    async handleFiscalData(userId, message) {
        // Extraer datos con Gemini
        const extractedData = await this.geminiExtractor.extractFiscalData(message);
        if (!extractedData) {
            return "❌ No pude identificar tus datos fiscales. Por favor, envíalos en el formato indicado.";
        }
        // Validar datos
        const validation = this.validator.validate(extractedData);
        if (!validation.isValid) {
            if (validation.errors.length > 0) {
                const errorMessages = validation.errors.map(e => `❌ ${e.message}`).join('\n');
                return `❌ Datos inválidos:\n\n${errorMessages}`;
            }
            if (validation.missingFields.length > 0) {
                const missingFields = validation.missingFields.join(', ');
                return `📝 Solo me falta: ${missingFields}\n\n¿Me los proporcionas?`;
            }
        }
        return `✅ Datos recibidos correctamente. Tu factura está siendo procesada.`;
    }
}
