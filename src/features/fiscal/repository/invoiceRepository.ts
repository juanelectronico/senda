// src/features/fiscal/repository/invoiceRepository.ts

import { Invoice, FiscalData } from '../types/index.js';

// Simulación de base de datos (reemplazar con Supabase después)
const invoices: Invoice[] = [];

export class InvoiceRepository {
  async create(data: {
    clienteId: string;
    fiscalData: FiscalData;
    status: 'PENDING' | 'COMPLETED' | 'REJECTED';
    monto?: number;
    concepto?: string;
  }): Promise<Invoice> {
    const newInvoice: Invoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      clienteId: data.clienteId,
      fiscalData: data.fiscalData,
      monto: data.monto || 0,
      concepto: data.concepto || 'Producto/Servicio',
      status: data.status,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Guardar en el arreglo (simulación)
    invoices.push(newInvoice);
    
    console.log('✅ Factura creada:', newInvoice.id);
    
    // TODO: Reemplazar con Supabase
    // const { data, error } = await supabase
    //   .from('invoices')
    //   .insert(newInvoice)
    //   .select();
    // if (error) throw error;
    // return data[0];

    return newInvoice;
  }

  async update(id: string, updates: Partial<Invoice>): Promise<Invoice> {
    const index = invoices.findIndex(inv => inv.id === id);
    if (index === -1) {
      throw new Error(`Factura ${id} no encontrada`);
    }

    invoices[index] = {
      ...invoices[index],
      ...updates,
      updatedAt: new Date()
    };

    console.log('✅ Factura actualizada:', id);
    return invoices[index];
  }

  async findById(id: string): Promise<Invoice | null> {
    const invoice = invoices.find(inv => inv.id === id);
    return invoice || null;
  }

  async findByClienteId(clienteId: string): Promise<Invoice[]> {
    return invoices.filter(inv => inv.clienteId === clienteId);
  }

  async updateStatus(id: string, status: 'PENDING' | 'COMPLETED' | 'REJECTED'): Promise<Invoice> {
    return this.update(id, { status });
  }
}