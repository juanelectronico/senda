const { Client } = require('pg')

const client = new Client({
  connectionString: 'postgresql://postgres.tgbkmyisqudseinfnykq:SendaProyecto2026@aws-1-us-west-2.pooler.supabase.com:5432/postgres'
})

async function test() {
  try {
    await client.connect()
    console.log('✅ Conectado a Supabase!')
    const result = await client.query('SELECT NOW() as hora')
    console.log('Hora en la base de datos:', result.rows[0].hora)
    await client.end()
  } catch(e) {
    console.error('❌ Error:', e.message)
  }
}

test()