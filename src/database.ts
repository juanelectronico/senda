import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Hemos actualizado la función para que reciba todos los campos obligatorios
export const guardarRFC = async (
  rfc: string, 
  razonSocial: string, 
  email: string, 
  commerceId: string
) => {
  try {
    const nuevoCliente = await prisma.customer.create({
      data: {
        rfc: rfc.toUpperCase().trim(),
        razonSocial: razonSocial.trim(),
        email: email.toLowerCase().trim(),
        commerceId: commerceId, // Este vincula al cliente con el comercio
      },
    });
    console.log("✅ Cliente guardado con éxito:", nuevoCliente.rfc);
    return nuevoCliente;
  } catch (error) {
    console.error("❌ Error al guardar en la base de datos:", error);
    return null;
  }
};