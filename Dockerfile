# 1. Usar una imagen oficial de Node 20
FROM node:20-slim

# 2. Instalar dependencias necesarias para Prisma y otras librerías de sistema
RUN apt-get update && apt-get install -y \
    openssl \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# 3. Definir el directorio de trabajo dentro del contenedor
WORKDIR /app

# 4. Copiar los archivos de dependencias primero para aprovechar la caché
COPY package*.json ./
COPY prisma ./prisma/

# 5. Instalar todas las dependencias (incluyendo devDependencies para que tsc funcione)
RUN npm install

# 6. Copiar el resto del código fuente
COPY . .

# 7. Generar el cliente de Prisma
RUN npx prisma generate

# 8. Compilar el proyecto de TypeScript a JavaScript
RUN npm run build

# 9. Exponer el puerto (cambia 3000 si tu app usa otro)
EXPOSE 3000

# 10. Comando de inicio
CMD ["node", "dist/index.js"]