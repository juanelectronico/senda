require('dotenv').config();
const https = require('https');

const options = {
  hostname: 'www.facturapi.io',
  port: 443,
  path: '/v2/products',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + process.env.FACTURAPI_SECRET_KEY,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => {
  console.error('ERROR DE CONEXIÓN:', e.message);
});

req.end();