import 'dotenv/config';
import express from 'express';
import path from 'path';
import { supabase } from './config/supabase';

const app = express();
app.use(express.json());

// Servir el frontend
app.use(express.static(path.join(__dirname, '../public')));

// Ruta GET para obtener los registros
app.get('/api/customers', async (req, res) => {
    try {
        const { data, error } = await supabase.from('Invoice').select('*');
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta POST para guardar nuevos registros
app.post('/api/customers', async (req, res) => {
    try {
        const { customerEmail, customerRfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal } = req.body;
        
        // Generación de ID único
        const nuevoId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        const { data, error } = await supabase.from('Invoice').insert([{ 
            id: nuevoId,
            customerEmail,
            customerRfc,
            razon_social,
            regimen_fiscal,
            uso_cfdi,
            codigo_postal,
            commerceId: 'tienda_juan', 
            status: 'PENDING_CONFIRMATION', 
            amount: 0
        }]);

        if (error) throw error;
        res.status(201).json({ success: true, data });
    } catch (err: any) {
        console.error("Error al guardar:", err);
        res.status(500).json({ error: err.message });
    }
});

// Ruta de diagnóstico para verificar Facturapi
app.get('/api/check-facturapi', async (req, res) => {
    try {
        const apiKey = process.env.FACTURAPI_SECRET_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ status: 'Error', message: 'La variable FACTURAPI_SECRET_KEY no está definida en .env' });
        }

        const response = await fetch('https://www.facturapi.io/v2/invoices', {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            res.json({ status: 'Conexión exitosa' });
        } else {
            const errorData = await response.json();
            res.status(response.status).json({ status: 'Error de conexión', details: errorData });
        }
    } catch (err: any) {
        res.status(500).json({ status: 'Falla en el servidor', message: err.message });
    }
});

// Prueba de lectura de variables de entorno al iniciar
if (process.env.FACTURAPI_SECRET_KEY) {
    console.log("✅ ¡Éxito! El servidor detectó la FACTURAPI_SECRET_KEY.");
} else {
    console.log("❌ Error: El servidor NO pudo encontrar la FACTURAPI_SECRET_KEY.");
}

app.listen(3000, () => console.log('🚀 Senda listo en http://localhost:3000'));