const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  __internal: {
    configOverride: (config) => {
      config.datasources = {
        db: {
          url: "postgresql://postgres.tgbkmyisqudseinfnykq:SendaProyecto2026@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
        }
      };
      return config;
    }
  }
});

async function main() {
  console.log('🌱 Iniciando el semillado de la base de datos de Senda...');

  // 1. Limpiar datos previos
  await prisma.job.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  // 2. Crear un Usuario Emisor
  const user = await prisma.user.create({
    data: {
      email: 'contacto@senda.com',
      name: 'Senda Tecnologías S.A.',
    },
  });
  console.log(`✅ Usuario emisor creado: ${user.name}`);

  // 3. Crear un Cliente de prueba
  const customer = await prisma.customer.create({
    data: {
      userId: user.id,
      rfc: 'XAXX010101000',
      legalName: 'PUBLICO EN GENERAL',
      taxRegimen: '616',
      postalCode: '06000',
      email: 'cliente.prueba@senda.com',
      phone: '5512345678',
    },
  });
  console.log(`✅ Cliente de prueba creado: ${customer.legalName}`);

  // 4. Crear una Factura inicial
  const invoice = await prisma.invoice.create({
    data: {
      userId: user.id,
      customerId: customer.id,
      amount: 1500.50,
      status: 'DRAFT',
    },
  });
  console.log(`✅ Factura inicial creada: $${invoice.amount}`);

  console.log('🏁 ¡Semillado completado con éxito absoluto!');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el semillado:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });