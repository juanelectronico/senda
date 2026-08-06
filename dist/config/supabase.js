// ===== PASO 1: FORZAR WEBSOCKET GLOBAL ANTES DE CUALQUIER COSA =====
import { WebSocket } from 'ws';
global.WebSocket = WebSocket;
// ===== PASO 2: IMPORTS =====
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
// ===== PASO 3: VALIDAR VARIABLES DE ENTORNO =====
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
console.log('🔍 [Supabase] URL:', SUPABASE_URL ? '✅ Configurada' : '❌ No configurada');
console.log('🔍 [Supabase] ANON_KEY:', SUPABASE_ANON_KEY ? '✅ Configurada' : '❌ No configurada');
console.log('🔍 [Supabase] WebSocket disponible:', typeof global.WebSocket === 'function' ? '✅ Sí' : '❌ No');
// ===== PASO 4: VALIDACIÓN CRÍTICA =====
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("❌ Faltan las variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY");
}
// ===== PASO 5: CREAR CLIENTE SUPABASE CON CONFIGURACIÓN CORRECTA =====
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false, // Importante para serverless
        autoRefreshToken: false, // Desactivar para Cloud Run
        detectSessionInUrl: false, // Desactivar para backend
    },
    realtime: {
        // ✅ CONFIGURACIÓN CORRECTA PARA NODE.JS 20
        params: {
            eventsPerSecond: 10,
        },
    },
    // ✅ CONFIGURACIÓN ADICIONAL PARA NODE.JS 20
    db: {
        schema: 'public',
    },
    global: {
        headers: {
            'X-Client-Info': 'supabase-js/2.39.0',
        },
    },
});
// ===== PASO 6: VERIFICAR QUE EL CLIENTE SE CREÓ CORRECTAMENTE =====
console.log('✅ [Supabase] Cliente inicializado correctamente');
// ===== PASO 7: EXPORTAR TAMBIÉN EL WEBSOCKET PARA USO EXTERNO =====
export { WebSocket };
// ===== PASO 8: FUNCIÓN DE PRUEBA PARA VERIFICAR CONEXIÓN =====
export async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('commerce').select('count').limit(1);
        if (error) {
            console.error('❌ [Supabase] Error de conexión:', error.message);
            return false;
        }
        console.log('✅ [Supabase] Conexión exitosa');
        return true;
    }
    catch (error) {
        console.error('❌ [Supabase] Error al conectar:', error.message);
        return false;
    }
}
console.log('✅ [Supabase] Módulo cargado correctamente');
