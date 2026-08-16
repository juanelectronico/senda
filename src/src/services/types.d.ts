// src/types.d.ts

// Declaraciones de módulos que NO tienen tipos oficiales o que no los has instalado
declare module 'facturapi';
declare module '@whiskeysockets/baileys';
declare module '@hapi/boom';

// NOTA: 'qrcode-terminal' se eliminó porque ya ejecutaste 'npm install --save-dev @types/qrcode-terminal'.
// TypeScript lo encontrará automáticamente en tu carpeta node_modules/@types.

// NOTA: 'zod' y '@prisma/client' se eliminaron porque vienen con sus propios tipos (están escritos en TypeScript nativo).
// Si los declaras manualmente aquí, TypeScript se quejará de que los tipos están duplicados.