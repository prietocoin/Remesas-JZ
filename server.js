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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. Obtener lista de asesores únicos
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

// 2. Obtener Hashes dinámicos filtrados por Asesor y/o Rango de Fechas
app.get('/api/hashes', async (req, res) => {
  try {
    const { asesor, fechaInicio, fechaFin } = req.query;
    let query = `
      SELECT DISTINCT hash_corto 
      FROM registros 
      WHERE hash_corto IS NOT NULL AND hash_corto != ''`;
    let params = [];

    if (asesor) {
      params.push(asesor);
      query += ` AND nombre_asesor = $${params.length}`;
    }

    if (fechaInicio) {
      params.push(fechaInicio);
      query += ` AND created_at::date >= $${params.length}`;
    }

    if (fechaFin) {
      params.push(fechaFin);
      query += ` AND created_at::date <= $${params.length}`;
    }

    query += ' ORDER BY hash_corto';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/hashes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Obtener operaciones filtradas (Jerarquía: Asesor -> Rango Fecha -> Hash)
app.get('/api/remesas', async (req, res) => {
  try {
    const { asesor, fechaInicio, fechaFin, hash } = req.query;
    let query = `
      SELECT 
        id, 
        nombre_asesor, 
        monto, 
        estado_proceso AS estado, 
        hash_corto,
        banco, 
        titular, 
        moneda, 
        created_at,
        fecha_hora 
      FROM registros 
      WHERE 1=1`;
    let params = [];

    if (asesor) {
      params.push(asesor);
      query += ` AND nombre_asesor = $${params.length}`;
    }

    if (fechaInicio) {
      params.push(fechaInicio);
      query += ` AND created_at::date >= $${params.length}`;
    }

    if (fechaFin) {
      params.push(fechaFin);
      query += ` AND created_at::date <= $${params.length}`;
    }

    if (hash) {
      params.push(hash);
      query += ` AND hash_corto = $${params.length}`;
    }

    query += ' ORDER BY id DESC LIMIT 200';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/remesas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. Edición de registro
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
