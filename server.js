const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use(express.static(__dirname));

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-db',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  database: process.env.DB_NAME || 'automatizaciones',
});

pool.on('error', (err) => {
  console.error('❌ [PostgreSQL Pool Error]:', err.message);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// MÓDULO TASAS & FACTORES - REMESAS JZ (NORMALIZADO)
// ==========================================

async function initTasasJZ() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jz_lotes (
        id_tasa VARCHAR(20) PRIMARY KEY,
        correo_zelle VARCHAR(255) DEFAULT 'GM Sports 21 LLC',
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS jz_mercado_tasas (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(20) NOT NULL,
        moneda VARCHAR(10) NOT NULL,
        tasa_base NUMERIC(18, 6) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jz_factores_matriz (
        moneda_origen VARCHAR(10) NOT NULL,
        moneda_destino VARCHAR(10) NOT NULL,
        factor NUMERIC(6, 4) NOT NULL DEFAULT 0.9000,
        PRIMARY KEY (moneda_origen, moneda_destino)
      );

      CREATE TABLE IF NOT EXISTS jz_notificaciones (
        id SERIAL PRIMARY KEY,
        id_tasa VARCHAR(20) NOT NULL,
        estado VARCHAR(20) DEFAULT 'PENDIENTE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_jz_mercado_tasas_id ON jz_mercado_tasas(id_tasa);
      CREATE INDEX IF NOT EXISTS idx_jz_notificaciones_id_tasa ON jz_notificaciones(id_tasa);
    `);

    // Sembrado inicial de factores
    const checkFactores = await pool.query('SELECT COUNT(*) FROM jz_factores_matriz');
    if (parseInt(checkFactores.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO jz_factores_matriz (moneda_origen, moneda_destino, factor) VALUES
        ('USD', 'VES', 0.9000), ('PEN', 'VES', 0.9350), ('PEN', 'COP', 0.9200),
        ('COP', 'VES', 0.9000), ('MXN', 'VES', 0.8500), ('PYP', 'VES', 0.9400),
        ('ESP', 'VES', 0.9400), ('BIZ', 'VES', 0.9100), ('ARS', 'VES', 0.9000),
        ('VES', 'COP', 0.9400), ('VES', 'PEN', 0.9400), ('PEN', 'CLP', 0.8700),
        ('USD', 'COP', 0.8800), ('USD', 'PEN', 0.9000), ('COP', 'PEN', 0.8800);
      `);
    }
    console.log('✅ [Remesas-JZ] Tablas normalizadas verificadas (jz_lotes + jz_mercado_tasas).');
  } catch (err) {
    console.error('❌ Error inicializando tablas de tasas JZ:', err.message);
  }
}
initTasasJZ();

// 1. Lectura de tasa activa en producción
app.get('/api/tasas/ultimas', async (req, res) => {
  try {
    const lastLot = await pool.query(
      `SELECT id_tasa, correo_zelle FROM jz_lotes WHERE id_tasa != 'BORRADOR' ORDER BY timestamp DESC, created_at DESC LIMIT 1;`
    );
    if (lastLot.rows.length === 0) {
      return res.json({ success: true, id_tasa: 'T001', tasas: { USD: 1.0, USDT: 1.0 }, correo_zelle: 'GM Sports 21 LLC' });
    }
    
    const idTasa = lastLot.rows[0].id_tasa;
    const correoZelle = lastLot.rows[0].correo_zelle;
    const rates = await pool.query(`SELECT moneda, tasa_base FROM jz_mercado_tasas WHERE id_tasa = $1;`, [idTasa]);
    
    const tasasObj = { USD: 1.0, USDT: 1.0 };
    rates.rows.forEach(r => { tasasObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });
    
    res.json({ success: true, id_tasa: idTasa, tasas: tasasObj, correo_zelle: correoZelle });
  } catch (err) { 
    res.status(500).json({ success: false, error: err.message }); 
  }
});

// 2. Consulta en vivo desde Binance P2P API (Guarda BORRADOR)
app.post('/api/tasas/binance', async (req, res) => {
  const client = await pool.connect();
  try {
    const fiats = ['PEN', 'VES', 'COP', 'CLP', 'MXN', 'ARS', 'EUR'];
    const ratesObj = { USD: 1.0, USDT: 1.0 };

    for (const fiat of fiats) {
      try {
        const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 1, rows: 5, asset: 'USDT', fiat: fiat, tradeType: 'BUY' })
        });
        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
          const precios = data.data.slice(0, 3).map(adv => parseFloat(adv.adv.price));
          const promedio = precios.reduce((a, b) => a + b, 0) / precios.length;
          ratesObj[fiat] = Number(promedio.toFixed(2));
        }
      } catch (e) {
        console.error(`Error consultando Binance P2P (${fiat}):`, e.message);
      }
    }

    if (ratesObj['EUR']) ratesObj['ESP'] = ratesObj['EUR'];
    ratesObj['PYP'] = ratesObj['VES'] ? Number((ratesObj['VES'] * 0.82).toFixed(2)) : 790.00;

    const timestamp = Math.floor(Date.now() / 1000);

    await client.query('BEGIN');
    await client.query("DELETE FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';");
    await client.query("DELETE FROM jz_lotes WHERE id_tasa = 'BORRADOR';");
    
    await client.query(
      `INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp) VALUES ('BORRADOR', 'GM Sports 21 LLC', $1);`,
      [timestamp]
    );

    for (const [moneda, valor] of Object.entries(ratesObj)) {
      if (!isNaN(valor)) {
        await client.query(
          `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base) VALUES ('BORRADOR', $1, $2);`, 
          [moneda.toUpperCase(), valor]
        );
      }
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Borrador cargado desde Binance API.', rates: ratesObj, correo_zelle: 'GM Sports 21 LLC' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 3. Webhook de n8n
app.post('/api/tasas/n8n-webhook', async (req, res) => {
  const client = await pool.connect();
  try {
    let payload = Array.isArray(req.body) ? req.body[0] : req.body;
    let rates = (payload && (payload.rates || payload.json || payload)) || {};
    let correoZelle = (payload && (payload.correo_zelle || payload.correoZelle)) || 'GM Sports 21 LLC';
    const timestamp = Math.floor(Date.now() / 1000);

    await client.query('BEGIN');
    await client.query("DELETE FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';");
    await client.query("DELETE FROM jz_lotes WHERE id_tasa = 'BORRADOR';");

    await client.query(
      `INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp) VALUES ('BORRADOR', $1, $2);`,
      [correoZelle, timestamp]
    );
    
    for (const [moneda, valor] of Object.entries(rates)) {
      const numValor = parseFloat(valor);
      if (!isNaN(numValor)) {
        await client.query(
          `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base) VALUES ('BORRADOR', $1, $2);`, 
          [moneda.toUpperCase(), numValor]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Borrador cargado en jz_lotes y jz_mercado_tasas.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 4. Obtener borrador pendiente
app.get('/api/tasas/fetch-hoo', async (req, res) => {
  try {
    const lot = await pool.query(`SELECT correo_zelle FROM jz_lotes WHERE id_tasa = 'BORRADOR';`);
    if (lot.rows.length === 0) return res.status(404).json({ success: false, msg: 'Sin borrador pendiente.' });
    
    const rates = await pool.query(`SELECT moneda, tasa_base FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';`);
    const ratesObj = {};
    rates.rows.forEach(r => { ratesObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });
    
    res.json({ success: true, rates: ratesObj, correo_zelle: lot.rows[0].correo_zelle });
  } catch (err) { 
    res.status(500).json({ success: false, error: err.message }); 
  }
});

// 5. Promocionar borrador a lote oficial y notificar
app.post('/api/tasas/publicar', async (req, res) => {
  const client = await pool.connect();
  try {
    const tasas = req.body.tasas || {};
    const correoZelle = req.body.correo_zelle || 'GM Sports 21 LLC';
    const timestamp = Math.floor(Date.now() / 1000);

    await client.query('BEGIN');
    const lastLot = await client.query(
      `SELECT id_tasa FROM jz_lotes WHERE id_tasa != 'BORRADOR' ORDER BY created_at DESC LIMIT 1;`
    );
    
    let num = 1;
    if (lastLot.rows.length > 0) {
      const match = lastLot.rows[0].id_tasa.match(/\d+/);
      if (match) num = parseInt(match[0], 10) + 1;
    }
    const idTasaOficial = `T${String(num).padStart(3, '0')}`;

    // Inserta 1 solo registro de lote en la cabecera
    await client.query(
      `INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp) VALUES ($1, $2, $3);`,
      [idTasaOficial, correoZelle, timestamp]
    );

    // Inserta el detalle de divisas
    for (const [moneda, valor] of Object.entries(tasas)) {
      await client.query(
        `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base) VALUES ($1, $2, $3);`, 
        [idTasaOficial, moneda.toUpperCase(), parseFloat(valor)]
      );
    }

    // Limpia borradores
    await client.query("DELETE FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';");
    await client.query("DELETE FROM jz_lotes WHERE id_tasa = 'BORRADOR';");
    
    // Inserción única en jz_notificaciones
    await client.query(
      `INSERT INTO jz_notificaciones (id_tasa, estado) VALUES ($1, 'PENDIENTE');`,
      [idTasaOficial]
    );

    await client.query('COMMIT');

    res.json({ success: true, message: `Lote ${idTasaOficial} publicado con éxito para JZ.` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 6. Matriz de factores
app.get('/api/tasas/factores', async (req, res) => {
  try {
    const resBD = await pool.query('SELECT moneda_origen, moneda_destino, factor FROM jz_factores_matriz;');
    const matriz = {};
    resBD.rows.forEach(r => {
      if (!matriz[r.moneda_origen]) matriz[r.moneda_origen] = {};
      matriz[r.moneda_origen][r.moneda_destino] = parseFloat(r.factor);
    });
    res.json({ success: true, factores: matriz });
  } catch (err) { 
    res.status(500).json({ success: false, error: err.message }); 
  }
});

app.post('/api/tasas/factores', async (req, res) => {
  const client = await pool.connect();
  try {
    const { moneda_origen, factores } = req.body;
    if (!moneda_origen || !factores) {
      return res.status(400).json({ success: false, error: 'Parámetros faltantes.' });
    }

    await client.query('BEGIN');
    for (const [destino, val] of Object.entries(factores)) {
      await client.query(`
        INSERT INTO jz_factores_matriz (moneda_origen, moneda_destino, factor) VALUES ($1, $2, $3)
        ON CONFLICT (moneda_origen, moneda_destino) DO UPDATE SET factor = EXCLUDED.factor;
      `, [moneda_origen.toUpperCase(), destino.toUpperCase(), parseFloat(val)]);
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Comisiones de JZ actualizadas.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Endpoints complementarios
app.get('/api/raw-imagenes', async (req, res) => {
  try {
    const instancia = req.query.instancia || 'JOHN';
    const { rows } = await pool.query(
      `SELECT id, hash_largo, hash_corto, grupo_raw, usuario_raw, nombre_push, caption, url_imagen, COALESCE(conteo, 1) AS conteo, estado, instancia, created_at, timestamp_msg
       FROM registros_raw WHERE instancia = $1 AND url_imagen IS NOT NULL AND url_imagen != '' ORDER BY id DESC LIMIT 60`,
      [instancia]
    );
    res.json({ success: true, count: rows.length, rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/asesores', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT DISTINCT nombre_asesor FROM registros WHERE nombre_asesor IS NOT NULL AND nombre_asesor != '' ORDER BY nombre_asesor");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hashes', async (req, res) => {
  try {
    const { asesor, fechaInicio, fechaFin } = req.query;
    let query = `SELECT DISTINCT hash_corto FROM registros WHERE hash_corto IS NOT NULL AND hash_corto != ''`;
    let params = [];
    if (asesor) { params.push(asesor); query += ` AND nombre_asesor = $${params.length}`; }
    if (fechaInicio) { params.push(fechaInicio); query += ` AND created_at::date >= $${params.length}`; }
    if (fechaFin) { params.push(fechaFin); query += ` AND created_at::date <= $${params.length}`; }
    query += ' ORDER BY hash_corto';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/remesas', async (req, res) => {
  try {
    const { asesor, fechaInicio, fechaFin, hash } = req.query;
    let query = `SELECT id, nombre_asesor, monto, estado_proceso AS estado, tipo_operacion, hash_corto, titular, moneda, tasa, banco, fecha_hora, timestamp, hiperlink, created_at FROM registros WHERE 1=1`;
    let params = [];
    if (asesor) { params.push(asesor); query += ` AND nombre_asesor = $${params.length}`; }
    if (fechaInicio) { params.push(fechaInicio); query += ` AND created_at::date >= $${params.length}`; }
    if (fechaFin) { params.push(fechaFin); query += ` AND created_at::date <= $${params.length}`; }
    if (hash) { params.push(hash); query += ` AND hash_corto = $${params.length}`; }
    query += ' ORDER BY id DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tabla/:nombre', async (req, res) => {
  const tablasPermitidas = ['registros', 'registros_raw', 'comprobantes_test', 'cola_recepcion', 'vista_pares', 'jz_lotes', 'jz_mercado_tasas', 'jz_factores_matriz', 'jz_notificaciones', 't_nombres'];
  const tabla = req.params.nombre;
  if (!tablasPermitidas.includes(tabla)) return res.status(403).json({ error: 'Tabla no autorizada' });
  try {
    const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY 1 DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/remesas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, estado, titular, moneda, tasa, banco, hiperlink, tipo_operacion } = req.body;
    await pool.query(
      `UPDATE registros SET monto = $1, estado_proceso = $2, titular = $3, moneda = $4, tasa = $5, banco = $6, hiperlink = $7, tipo_operacion = $8 WHERE id = $9`,
      [monto, estado, titular, moneda, tasa, banco, hiperlink, tipo_operacion, id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`🚀 [Remesas-JZ] Servidor Node activo en puerto ${PORT}`));
