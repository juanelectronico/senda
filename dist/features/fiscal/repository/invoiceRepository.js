// src/features/fiscal/repository/invoiceRepository.ts
// Simulación de base de datos (reemplazar con Supabase después)
const invoices = [];
export class InvoiceRepository {
    async create(data) {
        const newInvoice = {
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
    async update(id, updates) {
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
    async findById(id) {
        const invoice = invoices.find(inv => inv.id === id);
        return invoice || null;
    }
    async findByClienteId(clienteId) {
        return invoices.filter(inv => inv.clienteId === clienteId);
    }
    async updateStatus(id, status) {
        return this.update(id, { status });
    }
}
