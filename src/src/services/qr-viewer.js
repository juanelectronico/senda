const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// El QR que generó Baileys (copia el texto largo que aparece en los logs)
// Busca en los logs: "QR generado (longitud: 277)" y copia el texto que aparece DESPUÉS
const qrData = "COPIA_AQUI_EL_TEXTO_QR_DE_LOS_LOGS";

// Generar imagen PNG
QRCode.toFile('qr.png', qrData, {
  type: 'png',
  width: 400,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#ffffff'
  }
}, function (err) {
  if (err) {
    console.error('❌ Error generando QR:', err);
    return;
  }
  console.log('✅ QR guardado como qr.png');
  console.log('📁 Ruta:', path.join(process.cwd(), 'qr.png'));
  console.log('📱 Escanea este QR con WhatsApp para vincular el dispositivo');
});