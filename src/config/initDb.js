const { pool } = require('./db');

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
        tasa_base NUMERIC(18, 6) NOT NULL,
        timestamp BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        correo_zelle VARCHAR(255)
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

      CREATE TABLE IF NOT EXISTS jz_directorio (
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
    console.log('✅ [Remesas-JZ] Tablas de base de datos inicializadas.');
  } catch (err) {
    console.error('❌ Error inicializando base de datos:', err.message);
  }
}

module.exports = { initTasasJZ };
