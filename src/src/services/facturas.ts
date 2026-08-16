import { supabase } from '../../config/supabase.js';
export class FacturaService {
    static async listInvoices(): Promise<any[]> {
        const { data, error } = await supabase.from('Invoice').select('*').order('createdAt', { ascending: false });
        if (error) throw new Error(`Error al obtener facturas: ${error.message}`);
        return data || [];
    }

    static async createInvoice(data: { customerId: string; amount: number }): Promise<any> {
        const { customerId, amount } = data;
        const { data: invoice, error } = await supabase
            .from('Invoice')
            .insert([{
                customerRfc: customerId, // Asumiendo que customerId es el RFC por ahora
                amount: amount,
                status: 'PENDING',
                commerceId: 'commerce_principal', // Placeholder
                createdAt: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw new Error(`Error al crear factura: ${error.message}`);
        return invoice;
    }

    static async prepareForStamping(invoiceId: string): Promise<any> {
        // Lógica para validar y preparar para timbrado
        const { data: invoice, error } = await supabase
            .from('Invoice')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (error || !invoice) throw new Error('Factura no encontrada');
        
        return { ...invoice, ready: true };
    }

    static async stampInvoice(invoiceId: string): Promise<any> {
        // Aquí iría la lógica real de Facturapi
        // Por ahora simulamos un timbrado exitoso
        await supabase
            .from('Invoice')
            .update({ status: 'STAMPED' })
            .eq('id', invoiceId);
        
        return { id: invoiceId, status: 'STAMPED' };
    }
}