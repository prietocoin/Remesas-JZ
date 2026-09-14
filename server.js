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

// ==========================================
// MÓDULO TASAS & FACTORES - REMESAS JZ
// ==========================================

// Inicialización automática de tablas en PostgreSQL
async function initTasasJZ() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mercado_tasas (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(20) NOT NULL,
        moneda VARCHAR(10) NOT NULL,
        tasa_base NUMERIC(18, 6) NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS factores_matriz (
        moneda_origen VARCHAR(10) NOT NULL,
        moneda_destino VARCHAR(10) NOT NULL,
        factor NUMERIC(6, 4) NOT NULL DEFAULT 0.9000,
        PRIMARY KEY (moneda_origen, moneda_destino)
      );
      CREATE INDEX IF NOT EXISTS idx_mercado_tasas_id ON mercado_tasas(id_tasa);
    `);
    console.log('✅ [Remesas-JZ] Tablas de mercado_tasas y factores_matriz listas.');
  } catch (err) {
    console.error('❌ Error inicializando tablas de tasas:', err.message);
  }
}
initTasasJZ();

// 1. Lectura de tasa activa en producción
app.get('/api/tasas/ultimas', async (req, res) => {
  try {
    const lastLot = await pool.query(`SELECT id_tasa FROM mercado_tasas WHERE id_tasa != 'BORRADOR' ORDER BY timestamp DESC, id DESC LIMIT 1;`);
    if (lastLot.rows.length === 0) return res.json({ id_tasa: 'T001', tasas: { USD: 1.0, USDT: 1.0 } });
    
    const idTasa = lastLot.rows[0].id_tasa;
    const rates = await pool.query(`SELECT moneda, tasa_base FROM mercado_tasas WHERE id_tasa = $1;`, [idTasa]);
    const tasasObj = { USD: 1.0, USDT: 1.0 };
    rates.rows.forEach(r => { tasasObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });
    res.json({ success: true, id_tasa: idTasa, tasas: tasasObj });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 2. Recepción de Webhook desde n8n -> Guarda 'BORRADOR'
app.post('/api/tasas/n8n-webhook', async (req, res) => {
  try {
    let payload = Array.isArray(req.body) ? req.body[0] : req.body;
    let rates = payload.rates || payload.json || payload;
    const timestamp = Math.floor(Date.now() / 1000);

    await pool.query("DELETE FROM mercado_tasas WHERE id_tasa = 'BORRADOR';");
    for (const [moneda, valor] of Object.entries(rates)) {
      if (!isNaN(parseFloat(valor))) {
        await pool.query(`INSERT INTO mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ('BORRADOR', $1, $2, $3);`, 
        [moneda.toUpperCase(), parseFloat(valor), timestamp]);
      }
    }
    res.json({ success: true, message: 'Borrador cargado en PostgreSQL.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 3. Obtener borrador pendiente
app.get('/api/tasas/fetch-hoo', async (req, res) => {
  try {
    const rates = await pool.query(`SELECT moneda, tasa_base FROM mercado_tasas WHERE id_tasa = 'BORRADOR';`);
    if (rates.rows.length === 0) return res.status(404).json({ success: false, msg: 'Sin borrador pendiente.' });
    const ratesObj = {};
    rates.rows.forEach(r => { ratesObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });
    res.json({ success: true, rates: ratesObj });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 4. Promocionar borrador a lote oficial (T001, T002...)
app.post('/api/tasas/publicar', async (req, res) => {
  try {
    const { tasas } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);
    const lastLot = await pool.query(`SELECT id_tasa FROM mercado_tasas WHERE id_tasa != 'BORRADOR' ORDER BY id DESC LIMIT 1;`);
    
    let num = 1;
    if (lastLot.rows.length > 0) {
      const match = lastLot.rows[0].id_tasa.match(/\d+/);
      if (match) num = parseInt(match[0], 10) + 1;
    }
    const idTasaOficial = `T${String(num).padStart(3, '0')}`;

    for (const [moneda, valor] of Object.entries(tasas)) {
      await pool.query(`INSERT INTO mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`, 
      [idTasaOficial, moneda.toUpperCase(), parseFloat(valor), timestamp]);
    }
    await pool.query("DELETE FROM mercado_tasas WHERE id_tasa = 'BORRADOR';");
    res.json({ success: true, message: `Lote ${idTasaOficial} publicado con éxito.` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 5. Matriz de factores
app.get('/api/tasas/factores', async (req, res) => {
  try {
    const resBD = await pool.query('SELECT moneda_origen, moneda_destino, factor FROM factores_matriz;');
    const matriz = {};
    resBD.rows.forEach(r => {
      if (!matriz[r.moneda_origen]) matriz[r.moneda_origen] = {};
      matriz[r.moneda_origen][r.moneda_destino] = parseFloat(r.factor);
    });
    res.json({ success: true, factores: matriz });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/tasas/factores', async (req, res) => {
  try {
    const { moneda_origen, factores } = req.body;
    for (const [destino, val] of Object.entries(factores)) {
      await pool.query(`
        INSERT INTO factores_matriz (moneda_origen, moneda_destino, factor) VALUES ($1, $2, $3)
        ON CONFLICT (moneda_origen, moneda_destino) DO UPDATE SET factor = EXCLUDED.factor;
      `, [moneda_origen.toUpperCase(), destino.toUpperCase(), parseFloat(val)]);
    }
    res.json({ success: true, message: 'Factores actualizados.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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
