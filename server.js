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
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 4000,
});

pool.on('error', (err) => {
  console.error('❌ [PostgreSQL Pool Error]:', err.message);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// MÓDULO TASAS & FACTORES - REMESAS JZ
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

      CREATE TABLE IF NOT EXISTS directorio (
        id_grupo VARCHAR(50) PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        roles VARCHAR(50),
        moneda_socio VARCHAR(10),
        grupo VARCHAR(255),
        porcentaje_comision VARCHAR(20),
        descuento VARCHAR(50),
        creado_en TIMESTAMP WITH TIME ZONE,
        moneda_base VARCHAR(10)
      );

      CREATE INDEX IF NOT EXISTS idx_jz_mercado_tasas_id ON jz_mercado_tasas(id_tasa);
      CREATE INDEX IF NOT EXISTS idx_jz_notificaciones_id_tasa ON jz_notificaciones(id_tasa);
    `);

    await pool.query(`ALTER TABLE jz_mercado_tasas ALTER COLUMN timestamp DROP NOT NULL;`).catch(() => {});

    await pool.query(`
      INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp)
      SELECT 
        id_tasa, 
        'GM Sports 21 LLC' AS correo_zelle, 
        COALESCE(MAX(timestamp), EXTRACT(EPOCH FROM NOW())::bigint) AS timestamp
      FROM jz_mercado_tasas
      WHERE id_tasa IS NOT NULL AND id_tasa != ''
      GROUP BY id_tasa
      ON CONFLICT (id_tasa) DO NOTHING;
    `);

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
    console.log('✅ [Remesas-JZ] Tablas verificadas e inicializadas correctamente.');
  } catch (err) {
    console.error('❌ Error inicializando tablas de tasas JZ:', err.message);
  }
}
initTasasJZ();

// 1. BÚSQUEDA DE IMÁGENES RAW (Filtrado por Instancia JOHN)
app.get('/api/raw-imagenes', async (req, res) => {
  try {
    const instanciaFiltro = String(req.query.instancia || 'JOHN').toUpperCase().trim();
    let rows = [];

    const rawRes = await pool.query(`
      SELECT hash_largo, hash_corto, grupo_raw, usuario_raw, nombre_push, caption, 
             url_imagen, COALESCE(conteo, 1) AS conteo, estado, instancia, timestamp_msg
      FROM registros_raw 
      WHERE url_imagen IS NOT NULL AND TRIM(CAST(url_imagen AS text)) != ''
        AND UPPER(COALESCE(instancia, 'JOHN')) LIKE $1
      ORDER BY timestamp_msg DESC LIMIT 60
    `, [`%${instanciaFiltro}%`]).catch(err => {
      console.warn('⚠️ Fallo consulta en registros_raw:', err.message);
      return { rows: [] };
    });

    rows = rawRes.rows || [];

    if (rows.length === 0) {
      const regFallback = await pool.query(`
        SELECT id, hash_corto, nombre_asesor AS nombre_push, titular AS usuario_raw, 
               banco AS grupo_raw, monto::text AS caption, hiperlink AS url_imagen, 
               estado_proceso AS estado, created_at 
        FROM registros 
        WHERE hiperlink IS NOT NULL AND TRIM(CAST(hiperlink AS text)) != '' 
        ORDER BY id DESC LIMIT 60
      `).catch(() => ({ rows: [] }));
      rows = regFallback.rows || [];
    }

    const normalized = rows.map((r, idx) => {
      let fecha = new Date();
      if (r.created_at) {
        fecha = new Date(r.created_at);
      } else if (r.timestamp_msg) {
        let ts = Number(r.timestamp_msg);
        if (ts < 1e11) ts *= 1000;
        fecha = new Date(ts);
      }

      return {
        id: r.id || r.hash_corto || r.hash_largo || (idx + 1),
        hash_largo: r.hash_largo || '',
        hash_corto: r.hash_corto || 'Sin Hash',
        grupo_raw: r.grupo_raw || 'Chat Directo',
        usuario_raw: r.usuario_raw || 'Cliente',
        nombre_push: r.nombre_push || r.usuario_raw || 'Desconocido',
        caption: r.caption || 'Sin texto...',
        url_imagen: r.url_imagen || '',
        conteo: r.conteo || 1,
        estado: r.estado || 'PROCESADO',
        instancia: r.instancia || 'JOHN',
        created_at: fecha.toISOString()
      };
    });

    res.json({ success: true, count: normalized.length, rows: normalized });
  } catch (err) {
    console.error('❌ Error en /api/raw-imagenes:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. ENDPOINT LECTURA IA (FUSIÓN: RAW + DIRECTORIO + COMPROBANTES_TEST)
app.get('/api/lecturas-ia', async (req, res) => {
  try {
    const instanciaFiltro = String(req.query.instancia || 'JOHN').toUpperCase().trim();

    const { rows } = await pool.query(`
      SELECT 
        r.hash_largo, 
        r.hash_corto, 
        r.url_imagen, 
        r.nombre_push, 
        r.usuario_raw, 
        r.grupo_raw, 
        r.caption, 
        r.timestamp_msg,
        r.estado AS estado_raw,
        d.nombre AS directorio_nombre,
        d.roles AS directorio_rol,
        d.moneda_socio AS directorio_moneda,
        d.porcentaje_comision AS directorio_comision,
        c.monto AS ia_monto,
        c.banco AS ia_banco,
        c.titular AS ia_titular,
        c.moneda AS ia_moneda,
        c.tasa AS ia_tasa,
        c.estado_proceso AS ia_estado
      FROM registros_raw r
      LEFT JOIN directorio d 
        ON (TRIM(r.grupo_raw) = TRIM(d.id_grupo))
      LEFT JOIN comprobantes_test c 
        ON (TRIM(r.hash_corto) = TRIM(c.hash_corto) OR TRIM(r.hash_largo) = TRIM(c.hash_largo))
      WHERE r.url_imagen IS NOT NULL AND TRIM(CAST(r.url_imagen AS text)) != ''
        AND UPPER(COALESCE(r.instancia, 'JOHN')) LIKE $1
      ORDER BY r.timestamp_msg DESC 
      LIMIT 50
    `, [`%${instanciaFiltro}%`]);

    const normalized = rows.map((r, idx) => {
      let fecha = new Date();
      if (r.timestamp_msg) {
        let ts = Number(r.timestamp_msg);
        if (ts < 1e11) ts *= 1000;
        fecha = new Date(ts);
      }

      return {
        id: r.hash_corto || r.hash_largo || (idx + 1),
        hash_corto: r.hash_corto || 'Sin Hash',
        url_imagen: r.url_imagen,
        nombre_push: r.nombre_push || r.usuario_raw || 'Desconocido',
        grupo_raw: r.grupo_raw || 'Chat Directo',
        caption: r.caption || '',
        created_at: fecha.toISOString(),
        directorio_nombre: r.directorio_nombre || null,
        directorio_rol: r.directorio_rol || 'Socio',
        directorio_moneda: r.directorio_moneda || 'USD',
        ia_monto: r.ia_monto || null,
        ia_banco: r.ia_banco || null,
        ia_titular: r.ia_titular || null,
        ia_moneda: r.ia_moneda || 'USD',
        ia_tasa: r.ia_tasa || null,
        ia_estado: r.ia_estado || r.estado_raw || 'PROCESADO'
      };
    });

    res.json({ success: true, count: normalized.length, rows: normalized });
  } catch (err) {
    console.error('❌ Error en /api/lecturas-ia:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Lectura de tasa activa en producción
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

// 4. Consulta en vivo desde Binance P2P API
app.post('/api/tasas/binance', async (req, res) => {
  const client = await pool.connect();
  try {
    const fiats = ['PEN', 'VES', 'COP', 'CLP', 'MXN', 'ARS', 'EUR'];
    const ratesObj = { USD: 1.0, USDT: 1.0 };

    for (const fiat of fiats) {
      try {
        const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'ClientType': 'web',
            'Origin': 'https://p2p.binance.com',
            'Referer': `https://p2p.binance.com/es/trade/all-payments/USDT?fiat=${fiat}`,
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify({ page: 1, rows: 5, asset: 'USDT', fiat: fiat, tradeType: 'BUY' })
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.data && data.data.length > 0) {
            const precios = data.data.slice(0, 3).map(adv => parseFloat(adv.adv.price));
            const promedio = precios.reduce((a, b) => a + b, 0) / precios.length;
            ratesObj[fiat] = Number(promedio.toFixed(2));
          }
        }
      } catch (e) {
        console.error(`❌ Error Binance (${fiat}):`, e.message);
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
          `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ('BORRADOR', $1, $2, $3);`, 
          [moneda.toUpperCase(), valor, timestamp]
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

// 5. Webhook de n8n
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
          `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ('BORRADOR', $1, $2, $3);`, 
          [moneda.toUpperCase(), numValor, timestamp]
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

// 6. Obtener borrador pendiente
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

// 7. Promocionar borrador a lote oficial
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

    await client.query(
      `INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp) VALUES ($1, $2, $3);`,
      [idTasaOficial, correoZelle, timestamp]
    );

    for (const [moneda, valor] of Object.entries(tasas)) {
      await client.query(
        `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`, 
        [idTasaOficial, moneda.toUpperCase(), parseFloat(valor), timestamp]
      );
    }

    await client.query("DELETE FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';");
    await client.query("DELETE FROM jz_lotes WHERE id_tasa = 'BORRADOR';");
    
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

// 8. Matriz de factores
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

// 9. CONSULTA TABLAS (Incluye 'directorio')
app.get('/api/tabla/:nombre', async (req, res) => {
  const tablasPermitidas = [
    'registros', 'registros_raw', 'comprobantes_test', 'cola_recepcion', 
    'vista_pares', 'jz_lotes', 'jz_mercado_tasas', 'jz_factores_matriz', 
    'jz_notificaciones', 't_nombres', 'directorio'
  ];
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
