const { pool } = require('../../config/db');

class VisorRepository {
  async obtenerRawImagenes(instancia = 'JOHN') {
    const filtro = `%${instancia.toUpperCase().trim()}%`;
    const rawRes = await pool.query(`
      SELECT hash_largo, hash_corto, grupo_raw, usuario_raw, nombre_push, caption, 
             url_imagen, COALESCE(conteo, 1) AS conteo, estado, instancia, timestamp_msg
      FROM registros_raw 
      WHERE url_imagen IS NOT NULL AND TRIM(CAST(url_imagen AS text)) != ''
        AND UPPER(COALESCE(instancia, 'JOHN')) LIKE $1
      ORDER BY timestamp_msg DESC LIMIT 60
    `, [filtro]).catch(() => ({ rows: [] }));

    let rows = rawRes.rows || [];

    if (rows.length === 0) {
      const fallback = await pool.query(`
        SELECT id, hash_corto, nombre_asesor AS nombre_push, titular AS usuario_raw, 
               banco AS grupo_raw, monto::text AS caption, hiperlink AS url_imagen, 
               estado_proceso AS estado, created_at 
        FROM registros 
        WHERE hiperlink IS NOT NULL AND TRIM(CAST(hiperlink AS text)) != '' 
        ORDER BY id DESC LIMIT 60
      `).catch(() => ({ rows: [] }));
      rows = fallback.rows || [];
    }

    return rows;
  }

  async obtenerLecturasIA(instancia = 'JOHN') {
    const filtro = `%${instancia.toUpperCase().trim()}%`;
    try {
      const { rows } = await pool.query(`
        SELECT 
          r.hash_largo, r.hash_corto, r.url_imagen, r.nombre_push, r.usuario_raw, 
          r.grupo_raw, r.caption, r.timestamp_msg, r.estado AS estado_raw,
          d.nombre AS directorio_nombre, d.roles AS directorio_rol,
          d.moneda_socio AS directorio_moneda, d.porcentaje_comision AS directorio_comision,
          c.monto AS ia_monto, c.banco AS ia_banco, c.titular AS ia_titular,
          c.moneda AS ia_moneda, c.tasa AS ia_tasa, c.estado_ia AS ia_estado
        FROM registros_raw r
        LEFT JOIN jz_directorio d ON (r.grupo_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(r.grupo_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
        LEFT JOIN comprobantes_raw c ON (r.hash_largo IS NOT NULL AND c.hash_largo IS NOT NULL AND TRIM(CAST(r.hash_largo AS text)) = TRIM(CAST(c.hash_largo AS text)))
        WHERE r.url_imagen IS NOT NULL AND TRIM(CAST(r.url_imagen AS text)) != ''
          AND (r.instancia IS NULL OR UPPER(CAST(r.instancia AS text)) LIKE $1)
        ORDER BY r.timestamp_msg DESC LIMIT 50
      `, [filtro]);

      return rows;
    } catch (err) {
      console.error('Error SQL en obtenerLecturasIA:', err.message);
      return [];
    }
  }

  async obtenerAsesores() {
    const { rows } = await pool.query("SELECT DISTINCT nombre_asesor FROM registros WHERE nombre_asesor IS NOT NULL AND nombre_asesor != '' ORDER BY nombre_asesor");
    return rows;
  }

  async obtenerHashes({ asesor, fechaInicio, fechaFin }) {
    let query = `SELECT DISTINCT hash_corto FROM registros WHERE hash_corto IS NOT NULL AND hash_corto != ''`;
    const params = [];
    if (asesor) { params.push(asesor); query += ` AND nombre_asesor = $${params.length}`; }
    if (fechaInicio) { params.push(fechaInicio); query += ` AND created_at::date >= $${params.length}`; }
    if (fechaFin) { params.push(fechaFin); query += ` AND created_at::date <= $${params.length}`; }
    query += ' ORDER BY hash_corto';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async obtenerRemesas({ asesor, fechaInicio, fechaFin, hash }) {
    let query = `SELECT id, nombre_asesor, monto, estado_proceso AS estado, tipo_operacion, hash_corto, titular, moneda, tasa, banco, fecha_hora, timestamp, hiperlink, created_at FROM registros WHERE 1=1`;
    const params = [];
    if (asesor) { params.push(asesor); query += ` AND nombre_asesor = $${params.length}`; }
    if (fechaInicio) { params.push(fechaInicio); query += ` AND created_at::date >= $${params.length}`; }
    if (fechaFin) { params.push(fechaFin); query += ` AND created_at::date <= $${params.length}`; }
    if (hash) { params.push(hash); query += ` AND hash_corto = $${params.length}`; }
    query += ' ORDER BY id DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async obtenerTablaGenerica(tabla) {
    const tablasPermitidas = [
      'registros', 'registros_raw', 'comprobantes_raw', 'comprobantes_test', 'cola_recepcion', 
      'vista_pares', 'jz_lotes', 'jz_mercado_tasas', 'jz_factores_matriz', 
      'jz_notificaciones', 't_nombres', 'jz_directorio'
    ];
    if (!tablasPermitidas.includes(tabla)) throw new Error('Tabla no autorizada');
    const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY 1 DESC LIMIT 100`);
    return rows;
  }

  async actualizarRemesa(id, datos) {
    const { monto, estado, titular, moneda, tasa, banco, hiperlink, tipo_operacion } = datos;
    await pool.query(
      `UPDATE registros SET monto = $1, estado_proceso = $2, titular = $3, moneda = $4, tasa = $5, banco = $6, hiperlink = $7, tipo_operacion = $8 WHERE id = $9`,
      [monto, estado, titular, moneda, tasa, banco, hiperlink, tipo_operacion, id]
    );
  }
}

module.exports = new VisorRepository();
