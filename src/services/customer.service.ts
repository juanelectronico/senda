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
   * Crear un nuevo cliente en la base de datos local
   */
  static async createCustomer(data: {
    name: string;
    email: string;
    taxId: string;
    taxRegimen: string;
    zipCode: string;
  }) {
    return await prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        taxId: data.taxId,
        taxRegimen: data.taxRegimen,
        zipCode: data.zipCode,
      },
    });
  }
}