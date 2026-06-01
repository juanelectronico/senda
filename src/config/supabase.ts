import { createClient } from '@supabase/supabase-js';

// Coloca aquí los datos reales de tu panel de Supabase
// (Los encuentras en tu proyecto de Supabase entrando a: Project Settings > API)
const SUPABASE_URL = 'https://tgbkmyisqudseinfnykq.supabase.co';

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYmtteWlzcXVkc2VpbmZueWtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTE3OTYsImV4cCI6MjA5NDEyNzc5Nn0.GKtfvDQsYSNnQ23Vo1TVjk2nRz9sJYoUVec3jh1Pg6M';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


