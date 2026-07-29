# 1. Usar una imagen oficial de Node 20
FROM node:20-slim

# 2. Instalar dependencias necesarias
RUN apt-get update && apt-get install -y \
    openssl \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# 3. Definir el directorio de trabajo
WORKDIR /app

# 4. Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# 5. Instalar dependencias
RUN npm install

# 6. Copiar el resto del código
COPY . .

# 7. Generar el cliente de Prisma
RUN npx prisma generate

# 8. Exponer el puerto
EXPOSE 3000

# 9. Iniciar el servidor con tsx (ejecuta TypeScript directamente)
CMD ["npx", "tsx", "src/index.ts"]