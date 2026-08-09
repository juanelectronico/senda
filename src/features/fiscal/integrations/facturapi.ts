import { FiscalData } from '../types/index.js';

interface FacturapiResponse {
  id: string;
  pdfUrl: string;
  xmlUrl: string;
  status: string;
}

export class FacturapiClient {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    // Soporte robusto para leer tanto FACTURAPI_SECRET_KEY como FACTURAPI_KEY
    this.apiKey = process.env.FACTURAPI_SECRET_KEY || process.env.FACTURAPI_KEY || '';
    this.apiUrl = process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2';
    
    if (!this.apiKey) {
      console.warn('⚠️ ADVERTENCIA: La llave de Facturapi no está configurada en las variables de entorno.');
    }
  }

  async createInvoice(data: {
    fiscalData: FiscalData;
    monto: number;
    concepto: string;
    clienteId: string;
  }): Promise<FacturapiResponse> {
    try {
      console.log('📄 Generando factura real en Facturapi:', {
        cliente: data.fiscalData.razonSocial,
        rfc: data.fiscalData.rfc,
        monto: data.monto
      });

      const response = await fetch(`${this.apiUrl}/invoices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: {
            legal_name: data.fiscalData.razonSocial,
            tax_id: data.fiscalData.rfc,
            tax_regime: data.fiscalData.regimenFiscal || '616',
            email: data.fiscalData.email,
            postal_code: data.fiscalData.codigoPostal
          },
          items: [
            {
              description: data.concepto || 'Servicios generales',
              quantity: 1,
              unit_price: data.monto,
              product_code: '84111506'
            }
          ],
          use_cfdi: data.fiscalData.usoCFDI || 'S01'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('❌ Error devuelto por Facturapi:', result);
        throw new Error(result.message || 'Error al timbrar en Facturapi');
      }

      return {
        id: result.id,
        pdfUrl: result.pdf || result.links?.pdf,
        xmlUrl: result.xml || result.links?.xml,
        status: result.status
      };

    } catch (error: any) {
      console.error('❌ Error en Facturapi:', error);
      throw new Error(`Error al generar la factura en Facturapi: ${error.message}`);
    }
  }

  async getInvoice(id: string): Promise<FacturapiResponse | null> {
    try {
      console.log('🔍 Obteniendo factura:', id);
      
      const response = await fetch(`${this.apiUrl}/invoices/${id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      if (!response.ok) return null;
      const result = await response.json();

      return {
        id: result.id,
        pdfUrl: result.pdf || result.links?.pdf,
        xmlUrl: result.xml || result.links?.xml,
        status: result.status
      };
    } catch (error) {
      console.error('❌ Error obteniendo factura:', error);
      return null;
    }
  }

  async cancelInvoice(id: string): Promise<boolean> {
    try {
      console.log('🗑️ Cancelando factura:', id);
      
      const response = await fetch(`${this.apiUrl}/invoices/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('❌ Error cancelando factura:', error);
      return false;
    }
  }
}