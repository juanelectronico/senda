const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Obtenemos los valores desde el archivo .env
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

console.log('🔍 SUPABASE_URL:', SUPABASE_URL);
console.log('🔍 SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✅ Configurada' : '❌ No configurada');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Faltan las variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY");
}

// Crear cliente de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = { supabase };