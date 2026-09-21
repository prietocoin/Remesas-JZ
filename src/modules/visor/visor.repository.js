const { pool } = require('../../config/db');

class VisorRepository {
  /**
   * Obtiene y agrupa impactos_raw filtrados por la instancia especificada (ej. JOHN / JHON)
   */
  async obtenerRawImagenes(instancia = 'JOHN') {
    try {
      const filtro = `%${(instancia || 'JOHN').trim().toLowerCase()}%`;
      const altFiltro = filtro.includes('john') ? '%jhon%' : '%john%';

      const { rows } = await pool.query(`
        SELECT 
          i.id,
          i.hash_largo, 
          COALESCE(i.hash_corto, SUBSTRING(i.hash_largo FROM 1 FOR 8), 'Sin Hash') AS hash_corto, 
          i.grupo_raw, 
          i.usuario_raw, 
          COALESCE(d.nombre, i.nombre_push, i.usuario_raw, 'Desconocido') AS nombre_push, 
          i.caption, 
          i.url_imagen, 
          COALESCE(i.estado, 'RECIBIDO') AS estado, 
          i.instancia, 
          i.created_at
        FROM impactos_raw i
        LEFT JOIN jz_directorio d ON (
          (i.grupo_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(i.grupo_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
          OR (i.usuario_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(i.usuario_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
        )
        WHERE i.url_imagen IS NOT NULL AND TRIM(CAST(i.url_imagen AS text)) != ''
          AND (
            LOWER(CAST(i.instancia AS text)) LIKE LOWER($1)
            OR LOWER(CAST(i.instancia AS text)) LIKE LOWER($2)
          )
        ORDER BY i.id DESC LIMIT 300
      `, [filtro, altFiltro]);

      const map = new Map();

      for (const r of rows) {
        const key = r.hash_largo || r.hash_corto || `id_${r.id}`;
        
        if (!map.has(key)) {
          map.set(key, {
            id: r.id,
            hash_largo: r.hash_largo,
            hash_corto: r.hash_corto || (r.hash_largo ? r.hash_largo.substring(0, 8) : `#${r.id}`),
            url_imagen: r.url_imagen,
            estado: r.estado || 'RECIBIDO',
            created_at: r.created_at,
            instancia: r.instancia,
            conteo: 1,
            impactos: [{
              id: r.id,
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
            imp => imp.grupo_raw === r.grupo_raw && imp.usuario_raw === r.usuario_raw
          );

          if (!yaExiste) {
            item.impactos.push({
              id: r.id,
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
   * Obtiene comprobantes_raw filtrados ESTRICTAMENTE por la instancia especificada (JOHN / JHON)
   */
  async obtenerLecturasIA(instancia = 'JOHN') {
    try {
      const filtro = `%${(instancia || 'JOHN').trim().toLowerCase()}%`;
      const altFiltro = filtro.includes('john') ? '%jhon%' : '%john%';

      const { rows } = await pool.query(`
        SELECT 
          c.hash_largo,
          SUBSTRING(c.hash_largo FROM 1 FOR 8) AS hash_corto,
          COALESCE(c.url_r2, i.url_imagen) AS url_imagen,
          c.monto AS ia_monto,
          c.banco AS ia_banco,
          c.titular AS ia_titular,
          c.moneda AS ia_moneda,
          COALESCE(c.estado_ia, 'PROCESADO') AS ia_estado,
          c.creado_en AS created_at,
          c.referencia,
          COALESCE(c.instancia, i.instancia) AS instancia,
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
          OR (i.usuario_raw IS NOT NULL AND d.id_grupo IS NOT NULL AND TRIM(CAST(i.usuario_raw AS text)) = TRIM(CAST(d.id_grupo AS text)))
        )
        WHERE (
          LOWER(CAST(c.instancia AS text)) LIKE LOWER($1)
          OR LOWER(CAST(c.instancia AS text)) LIKE LOWER($2)
          OR LOWER(CAST(i.instancia AS text)) LIKE LOWER($1)
          OR LOWER(CAST(i.instancia AS text)) LIKE LOWER($2)
        )
        ORDER BY c.creado_en DESC LIMIT 300
      `, [filtro, altFiltro]);

      const map = new Map();
      for (const r of rows) {
        const key = r.hash_largo || `ia_${r.created_at}_${Math.random()}`;
        if (!map.has(key)) {
          map.set(key, {
            ...r,
            nombre_push: r.directorio_nombre,
            grupo_raw: (r.grupo_raw && r.grupo_raw.includes('@')) ? r.grupo_raw : (r.usuario_raw || 'Chat Directo'),
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
