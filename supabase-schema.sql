-- Tabla de sesiones de chat para Senda
CREATE TABLE IF NOT EXISTS ChatSession (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    estado VARCHAR(50) DEFAULT 'INICIO',
    datos_parciales JSONB,
    pending_invoice_id INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de facturas (si no existe)
CREATE TABLE IF NOT EXISTS Invoice (
    id SERIAL PRIMARY KEY,
    customer_rfc VARCHAR(20),
    customer_email VARCHAR(255),
    razon_social TEXT,
    regimen_fiscal VARCHAR(50),
    uso_cfdi VARCHAR(50),
    codigo_postal VARCHAR(10),
    commerce_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_chat_session_phone ON ChatSession(phone_number);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON Invoice(status);