import { supabase, testSupabaseConnection } from './src/config/supabase.js';
console.log('🧪 Probando conexión a Supabase...');
await testSupabaseConnection();
