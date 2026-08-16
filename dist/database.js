import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export const guardarRFC = async (rfc) => {
    try {
        // NOTA: Como no tenemos los otros datos, ponemos valores dummy para que Prisma no falle
        const nuevoCliente = await prisma.customer.create({
            data: {
                rfc: rfc.toUpperCase().trim(),
                razonSocial: 'Cliente Temporal',
                email: 'temp@example.com',
                commerceId: 'commerce_principal'
            },
        });
        console.log("✅ Cliente guardado con éxito:", nuevoCliente.rfc);
        return nuevoCliente;
    }
    catch (error) {
        console.error("❌ Error al guardar en la base de datos:", error);
    }
};
