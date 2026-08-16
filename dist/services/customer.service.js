import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export class CustomerService {
    /**
     * Obtener la lista de todos los clientes
     */
    static async listCustomers() {
        return await prisma.customer.findMany();
    }
    /**
     * Crear un nuevo cliente en la base de datos
     */
    static async createCustomer(data) {
        return await prisma.customer.create({
            data: {
                rfc: data.rfc,
                razonSocial: data.razonSocial,
                email: data.email,
                commerceId: data.commerceId,
            },
        });
    }
}
