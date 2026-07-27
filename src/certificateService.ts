import { createClient } from '@supabase/supabase-js';
import { supabase } from './config/supabase';

// Función para subir el certificado de forma segura
export async function uploadCertificate(commerceId: string, fileBuffer: Buffer, fileName: string) {
  const filePath = `${commerceId}/${fileName}`;

  // 1. Subir al bucket privado de Supabase Storage
  const { data, error } = await supabase.storage
    .from('fiscal-certificates')
    .upload(filePath, fileBuffer, {
      upsert: true,
      contentType: 'application/x-x509-ca-cert'
    });

  if (error) {
    throw new Error(`Error al subir a Supabase: ${error.message}`);
  }

  // 2. Guardar la ruta en la tabla commerce usando Supabase
  const { error: updateError } = await supabase
    .from('commerce')
    .update({ certificate_path: data.path })
    .eq('id', commerceId);

  if (updateError) {
    throw new Error(`Error al actualizar la ruta en la base de datos: ${updateError.message}`);
  }

  return { success: true, path: data.path };
}