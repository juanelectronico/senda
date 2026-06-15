import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const guardarRFC = async (rfc: string) => {
  try {
    const nuevoCliente = await prisma.user.create({
      data: {
        rfc: rfc.toUpperCase().trim(),
      },
    });
    console.log("✅ Cliente guardado con éxito:", nuevoCliente.rfc);
    return nuevoCliente;
  } catch (error) {
    console.error("❌ Error al guardar en la base de datos:", error);
  }
};