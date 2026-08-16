import { Firestore } from '@google-cloud/firestore';
import 'dotenv/config';

async function revisarFirestore() {
  const firestore = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'project-9a1eb3ec-f78b-469d-bda',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
  });

  const commerceId = '07496960-a7c1-4ce0-a148-75995ed0ac28';
  console.log(`🔍 Consultando Firestore para el comercio: ${commerceId}...`);

  const docRef = firestore.collection('whatsapp_auth').doc(commerceId);
  const doc = await docRef.get();

  if (doc.exists) {
    console.log('✅ ¡Sí existe el documento en Firestore!');
    console.log('📦 Datos encontrados (resumen):', Object.keys(doc.data() || {}));
  } else {
    console.log('❌ El documento NO existe en Firestore. (Por eso no se conecta la sesión anterior).');
  }
}

revisarFirestore().catch(console.error);