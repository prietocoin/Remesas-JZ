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

// Endpoint: Hashes dinámicos
app.get('/api/hashes', async (req, res) => {
  try {
    const { asesor, fechaInicio, fechaFin } = req.query;
    let query = `SELECT DISTINCT hash_corto FROM registros WHERE hash_corto IS NOT NULL AND hash_corto != ''`;
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

// Endpoint: Registros principales
app.get('/api/remesas', async (req, res) => {
  try {
    const { asesor, fechaInicio, fechaFin, hash } = req.query;
    let query = `
      SELECT 
        id, 
        nombre_asesor, 
        monto, 
        estado_proceso AS estado, 
        tipo_operacion,
        hash_corto,
        titular,
        moneda,
        tasa,
        banco,
        fecha_hora,
        timestamp,
        hiperlink,
        created_at
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

// Endpoint: Visor Genérico para revisión de otras tablas
app.get('/api/tabla/:nombre', async (req, res) => {
  const tablasPermitidas = ['registros', 'cola_recepcion', 'vista_pares', 'tasas_mercado', 't_nombres'];
  const tabla = req.params.nombre;
  
  if (!tablasPermitidas.includes(tabla)) {
    return res.status(403).json({ error: 'Tabla no autorizada para revisión' });
  }

  try {
    const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY 1 DESC LIMIT 100`);
    res.json(rows);
  } catch (err) {
    console.error(`❌ Error en /api/tabla/${tabla}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Guardar cambios
app.put('/api/remesas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, estado, titular, moneda, tasa, banco, hiperlink, tipo_operacion } = req.body;

    await pool.query(
      `UPDATE registros 
       SET monto = $1, estado_proceso = $2, titular = $3, moneda = $4, tasa = $5, banco = $6, hiperlink = $7, tipo_operacion = $8
       WHERE id = $9`,
      [monto, estado, titular, moneda, tasa, banco, hiperlink, tipo_operacion, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en /api/remesas/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
