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

# 7. Compilar TypeScript y generar Prisma (usa tu script oficial del package.json)
RUN npm run build

# 8. Cloud Run inyecta dinámicamente el puerto en la variable PORT (usamos 8080 por defecto)
ENV PORT=8080
EXPOSE 8080

# 9. Iniciar el servidor usando el archivo ya compilado en la carpeta dist
CMD ["node", "dist/index.js"]