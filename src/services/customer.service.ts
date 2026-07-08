import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const CustomerService = {
  async createCustomer(data: { rfc: string; razonSocial: string; email: string; commerceId: string }) {
    return await prisma.customer.create({
      data: {
        rfc: data.rfc,
        razonSocial: data.razonSocial,
        email: data.email,
        commerceId: data.commerceId,
      },
    });
  },

  async listCustomers() {
    return await prisma.customer.findMany();
  }
};