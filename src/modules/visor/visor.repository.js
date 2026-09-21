const { pool } = require('../../config/db');

class VisorRepository {
  async obtenerRawImagenes() {
    try {
      const { rows } = await pool.query(`
        SELECT id, hash_largo, hash_corto, grupo_raw, usuario_raw, nombre_push, caption, url_imagen, estado, created_at
        FROM impactos_raw
        WHERE url_imagen IS NOT NULL AND TRIM(CAST(url_imagen AS text)) != ''
        ORDER BY id DESC LIMIT 100
      `);

      const map = new Map();

      for (const r of rows) {
        const key = r.hash_largo || r.hash_corto || `id_${r.id}`;
        const hashCorto = r.hash_corto || (r.hash_largo ? r.hash_largo.substring(0, 8) : `#${r.id}`);

        if (!map.has(key)) {
          map.set(key, {
            id: r.id,
            hash_largo: r.hash_largo,
            hash_corto: hashCorto,
            url_imagen: r.url_imagen,
            estado: r.estado || 'RECIBIDO',
            created_at: r.created_at,
            conteo: 1,
            impactos: [{
              id: r.id,
              nombre_push: r.nombre_push || r.usuario_raw || 'Desconocido',
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
          item.impactos.push({
            id: r.id,
            nombre_push: r.nombre_push || r.usuario_raw || 'Desconocido',
            usuario_raw: r.usuario_raw,
            grupo_raw: r.grupo_raw,
            caption: r.caption
          });
        }
      }

      return Array.from(map.values());
    } catch (err) {
      console.error('Error en obtenerRawImagenes:', err.message);
      return [];
    }
  }

  async obtenerLecturasIA() {
    try {
      const { rows } = await pool.query(`
        SELECT 
          hash_largo,
          monto AS ia_monto,
          moneda AS ia_moneda,
          banco AS ia_banco,
          referencia,
          titular AS ia_titular,
          creado_en AS created_at,
          url_r2 AS url_imagen,
          estado_ia AS ia_estado,
          instancia
        FROM comprobantes_raw
        ORDER BY creado_en DESC LIMIT 100
      `);

      return rows.map(r => ({
        ...r,
        hash_corto: r.hash_largo ? r.hash_largo.substring(0, 8) : 'Sin Hash',
        nombre_push: r.ia_titular || 'Desconocido',
        usuario_raw: r.ia_titular || 'Sin usuario',
        grupo_raw: r.instancia || 'Sin grupo',
        caption: r.referencia || 'Sin texto...',
        ia_estado: r.ia_estado || 'PROCESADO'
      }));
    } catch (err) {
      console.error('Error en obtenerLecturasIA:', err.message);
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
