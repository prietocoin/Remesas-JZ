const { pool } = require('../../config/db');

class VisorRepository {
  async obtenerRawImagenes(instancia = 'JOHN') {
    const filtro = `%${instancia.toUpperCase().trim()}%`;
    try {
      const rawRes = await pool.query(`
        SELECT 
          r.hash_largo, 
          COALESCE(r.hash_corto, SUBSTRING(r.hash_largo FROM 1 FOR 8), 'Sin Hash') AS hash_corto, 
          r.grupo_raw, 
          r.usuario_raw, 
          COALESCE(d.nombre, r.nombre_push, r.usuario_raw, 'Desconocido') AS nombre_push, 
          r.caption, 
          r.url_imagen, 
          COALESCE(r.conteo, 1) AS conteo, 
          COALESCE(r.estado, 'RECIBIDO') AS estado, 
          r.instancia, 
          r.timestamp_msg,
          d.nombre AS directorio_nombre
        FROM registros_raw r
        LEFT JOIN jz_directorio d ON (
          (r.grupo_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(r.grupo_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
          OR (r.usuario_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(r.usuario_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
        )
        WHERE r.url_imagen IS NOT NULL AND TRIM(CAST(r.url_imagen AS text)) != ''
          AND (
            r.instancia IS NULL 
            OR UPPER(CAST(r.instancia AS text)) LIKE $1
            OR d.id_grupo IS NOT NULL
          )
        ORDER BY r.id DESC LIMIT 60
      `, [filtro]);

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
    } catch (err) {
      console.error('Error en obtenerRawImagenes:', err.message);
      return [];
    }
  }

  async obtenerLecturasIA(instancia = 'JOHN') {
    const filtro = `%${instancia.toUpperCase().trim()}%`;
    try {
      const { rows } = await pool.query(`
        SELECT 
          c.hash_largo,
          SUBSTRING(c.hash_largo FROM 1 FOR 8) AS hash_corto,
          c.url_r2 AS url_imagen,
          COALESCE(r.nombre_push, c.titular, 'Desconocido') AS nombre_push,
          COALESCE(r.usuario_raw, c.titular) AS usuario_raw,
          COALESCE(r.grupo_raw, c.instancia) AS grupo_raw,
          COALESCE(r.caption, c.referencia, 'Sin texto...') AS caption,
          EXTRACT(EPOCH FROM COALESCE(c.creado_en, NOW())) * 1000 AS timestamp_msg,
          c.monto AS ia_monto,
          c.banco AS ia_banco,
          c.titular AS ia_titular,
          c.moneda AS ia_moneda,
          c.estado_ia AS ia_estado,
          d.nombre AS directorio_nombre,
          d.roles AS directorio_rol,
          d.moneda_socio AS directorio_moneda,
          d.porcentaje_comision AS directorio_comision
        FROM comprobantes_raw c
        LEFT JOIN registros_raw r ON TRIM(CAST(c.hash_largo AS text)) = TRIM(CAST(r.hash_largo AS text))
        LEFT JOIN jz_directorio d ON (
          (r.grupo_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(r.grupo_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
          OR (c.instancia IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(c.instancia AS text)) = TRIM(CAST(d.id_grupo AS text)))
        )
        WHERE (c.instancia IS NULL OR UPPER(CAST(c.instancia AS text)) LIKE $1 OR d.id_grupo IS NOT NULL)
        ORDER BY c.creado_en DESC LIMIT 50
      `, [filtro]);
      return rows;
    } catch (err) {
      console.error('Error al consultar comprobantes_raw:', err.message);
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
