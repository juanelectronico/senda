-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING_CONFIRMATION', 'REJECTED', 'STAMPED');

-- CreateTable
CREATE TABLE "Commerce" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "customerRfc" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "facturapiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commerceId" TEXT NOT NULL,
    "razon_social" TEXT,
    "regimen_fiscal" TEXT,
    "uso_cfdi" TEXT,
    "codigo_postal" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Commerce_ownerPhone_key" ON "Commerce"("ownerPhone");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_commerceId_fkey" FOREIGN KEY ("commerceId") REFERENCES "Commerce"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

