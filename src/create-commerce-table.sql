-- Crear tabla commerce
CREATE TABLE IF NOT EXISTS commerce (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc VARCHAR(13) UNIQUE NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  tax_regime VARCHAR(100) NOT NULL,
  zip_code VARCHAR(5) NOT NULL,
  phone VARCHAR(15) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  csd_cer_base64 TEXT NOT NULL,
  csd_key_base64 TEXT NOT NULL,
  csd_password VARCHAR(100) NOT NULL,
  api_key VARCHAR(64) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_commerce_phone ON commerce(phone);
CREATE INDEX IF NOT EXISTS idx_commerce_rfc ON commerce(rfc);
CREATE INDEX IF NOT EXISTS idx_commerce_api_key ON commerce(api_key);