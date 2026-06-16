const https = require('https');

const options = {
  hostname: 'api.facturapi.io',
  port: 443,
  path: '/v2/products',
  method: 'GET',
  headers: {
    'Authorization': 'Basic ' + Buffer.from('TU_API_KEY' + ':').toString('base64')
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