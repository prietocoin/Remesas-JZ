const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  host: process.env.DB_HOST || 'automatizaciones_db-remesas',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'automatizaciones',
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint: Asesores
app.get('/api/asesores', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT nombre_asesor FROM registros WHERE nombre_asesor IS NOT NULL AND nombre_asesor != '' ORDER BY nombre_asesor"
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/asesores:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Operaciones/Remesas
app.get('/api/remesas', async (req, res) => {
  try {
    const { asesor } = req.query;
    let query = `
      SELECT 
        id, 
        nombre_asesor, 
        monto, 
        estado_proceso AS estado, 
        banco, 
        titular, 
        moneda, 
        fecha_hora 
      FROM registros`;
    let params = [];

    if (asesor) {
      query += ' WHERE nombre_asesor = $1';
      params.push(asesor);
    }
    query += ' ORDER BY id DESC LIMIT 100';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/remesas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Editar registro
app.put('/api/remesas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, estado } = req.body;

    await pool.query(
      'UPDATE registros SET monto = $1, estado_proceso = $2 WHERE id = $3',
      [monto, estado, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en /api/remesas/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
