const { pool } = require('../../config/db');

class VisorRepository {
  /**
   * Consulta DIRECTA sobre impactos_raw sin JOINs frágiles
   */
  async obtenerRawImagenes() {
    try {
      const { rows } = await pool.query(`
        SELECT 
          id,
          hash_largo, 
          COALESCE(hash_corto, SUBSTRING(hash_largo FROM 1 FOR 8), 'Sin Hash') AS hash_corto, 
          grupo_raw, 
          usuario_raw, 
          COALESCE(nombre_push, usuario_raw, 'Desconocido') AS nombre_push, 
          caption, 
          url_imagen, 
          COALESCE(estado, 'RECIBIDO') AS estado, 
          created_at
        FROM impactos_raw
        WHERE url_imagen IS NOT NULL AND TRIM(CAST(url_imagen AS text)) != ''
        ORDER BY id DESC LIMIT 100
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
              nombre_push: r.nombre_push,
              usuario_raw: r.usuario_raw,
              grupo_raw: r.grupo_raw,
              caption: r.caption
            }]
          });
        } else {
          const item = map.get(key);
          item.conteo += 1;
          if (r.estado === 'PROCESADO' || r.estado === 'LISTO_PARA_IA') {
            item.estado = r.estado;
          }

          const yaExiste = item.impactos.some(
            i => i.grupo_raw === r.grupo_raw && i.usuario_raw === r.usuario_raw
          );

          if (!yaExiste) {
            item.impactos.push({
              nombre_push: r.nombre_push,
              usuario_raw: r.usuario_raw,
              grupo_raw: r.grupo_raw,
              caption: r.caption
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
   * Consulta DIRECTA sobre comprobantes_raw sin JOINs frágiles
   */
  async obtenerLecturasIA() {
    try {
      const { rows } = await pool.query(`
        SELECT 
          hash_largo,
          SUBSTRING(hash_largo FROM 1 FOR 8) AS hash_corto,
          url_r2 AS url_imagen,
          titular AS nombre_push,
          titular AS usuario_raw,
          instancia AS grupo_raw,
          referencia AS caption,
          monto AS ia_monto,
          banco AS ia_banco,
          titular AS ia_titular,
          moneda AS ia_moneda,
          COALESCE(estado_ia, 'PROCESADO') AS ia_estado,
          creado_en AS created_at
        FROM comprobantes_raw
        ORDER BY creado_en DESC LIMIT 50
      `);
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
