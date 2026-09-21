const { pool } = require('../../config/db');

class VisorRepository {
  /**
   * Obtiene impactos_raw cruzados con jz_directorio
   * Agrupa en memoria varios envíos del mismo hash en 1 sola tarjeta (con conteo 2x, 3x, etc.)
   */
  async obtenerRawImagenes() {
    try {
      const { rows } = await pool.query(`
        SELECT 
          i.id,
          i.hash_largo, 
          COALESCE(i.hash_corto, SUBSTRING(i.hash_largo FROM 1 FOR 8), 'Sin Hash') AS hash_corto, 
          i.grupo_raw, 
          i.usuario_raw, 
          COALESCE(d.nombre, i.nombre_push, i.usuario_raw, 'Desconocido') AS nombre_socio, 
          d.roles,
          i.caption, 
          i.url_imagen, 
          COALESCE(i.estado, 'RECIBIDO') AS estado, 
          i.created_at
        FROM impactos_raw i
        LEFT JOIN jz_directorio d ON (
          (i.grupo_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(i.grupo_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
          OR (i.usuario_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(i.usuario_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
        )
        WHERE i.url_imagen IS NOT NULL AND TRIM(CAST(i.url_imagen AS text)) != ''
        ORDER BY i.id DESC LIMIT 150
      `);

      const map = new Map();

      for (const r of rows) {
        const key = r.hash_largo || r.hash_corto || `id_${r.id}`;
        
        if (!map.has(key)) {
          map.set(key, {
            id: r.id,
            hash_largo: r.hash_largo,
            hash_corto: r.hash_corto || (r.hash_largo ? r.hash_largo.substring(0, 8) : `id_${r.id}`),
            url_imagen: r.url_imagen,
            estado: r.estado || 'RECIBIDO',
            created_at: r.created_at,
            conteo: 1,
            impactos: [{
              id: r.id,
              nombre_push: r.nombre_socio,
              usuario_raw: r.usuario_raw,
              grupo_raw: r.grupo_raw,
              caption: r.caption,
              roles: r.roles
            }]
          });
        } else {
          const item = map.get(key);
          item.conteo += 1;
          if (r.estado === 'PROCESADO' || r.estado === 'LISTO_PARA_IA') {
            item.estado = r.estado;
          }

          const yaExiste = item.impactos.some(
            imp => imp.grupo_raw === r.grupo_raw && imp.usuario_raw === r.usuario_raw
          );

          if (!yaExiste) {
            item.impactos.push({
              id: r.id,
              nombre_push: r.nombre_socio,
              usuario_raw: r.usuario_raw,
              grupo_raw: r.grupo_raw,
              caption: r.caption,
              roles: r.roles
            });
          }
        }
      }

      return Array.from(map.values());
    } catch (err) {
      console.error('Error en obtenerRawImagenes:', err.message);
      return [];
    }
  }

  /**
   * Obtiene comprobantes_raw cruzados con impactos_raw y jz_directorio
   * Deduplica en memoria para mostrar solo 1 registro de IA por comprobante único
   */
  async obtenerLecturasIA() {
    try {
      const { rows } = await pool.query(`
        SELECT 
          c.hash_largo,
          SUBSTRING(c.hash_largo FROM 1 FOR 8) AS hash_corto,
          c.url_r2 AS url_imagen,
          c.monto AS ia_monto,
          c.banco AS ia_banco,
          c.titular AS ia_titular,
          c.moneda AS ia_moneda,
          COALESCE(c.estado_ia, 'PROCESADO') AS ia_estado,
          c.creado_en AS created_at,
          c.referencia,
          i.caption,
          i.grupo_raw,
          i.usuario_raw,
          COALESCE(d.nombre, i.nombre_push, c.titular, 'Desconocido') AS directorio_nombre,
          d.roles AS directorio_rol,
          d.moneda_socio AS directorio_moneda,
          d.porcentaje_comision AS directorio_comision
        FROM comprobantes_raw c
        LEFT JOIN impactos_raw i ON TRIM(CAST(c.hash_largo AS text)) = TRIM(CAST(i.hash_largo AS text))
        LEFT JOIN jz_directorio d ON (
          (i.grupo_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(i.grupo_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
          OR (c.instancia IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(c.instancia AS text)) = TRIM(CAST(d.id_grupo AS text)))
        )
        ORDER BY c.creado_en DESC LIMIT 100
      `);

      const map = new Map();
      for (const r of rows) {
        const key = r.hash_largo;
        if (!map.has(key)) {
          map.set(key, {
            ...r,
            nombre_push: r.directorio_nombre,
            caption: r.caption || r.referencia || 'Sin texto...'
          });
        }
      }

      return Array.from(map.values());
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
      'registros', 'registros_raw', 'impactos_raw', 'comprobantes_raw', 'comprobantes_test', 'cola_recepcion', 
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
