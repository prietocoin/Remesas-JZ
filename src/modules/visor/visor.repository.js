async obtenerRawImagenes(instancia = 'JOHN') {
    const filtro = `%${instancia.toUpperCase().trim()}%`;
    try {
      const { rows } = await pool.query(`
        SELECT 
          r.id,
          r.hash_largo, 
          COALESCE(r.hash_corto, SUBSTRING(r.hash_largo FROM 1 FOR 8), 'Sin Hash') AS hash_corto, 
          r.grupo_raw, 
          r.usuario_raw, 
          COALESCE(d.nombre, r.nombre_push, r.usuario_raw, 'Desconocido') AS nombre_push, 
          r.caption, 
          r.url_imagen, 
          COALESCE(r.estado, 'RECIBIDO') AS estado, 
          r.instancia, 
          COALESCE(r.timestamp_msg, EXTRACT(EPOCH FROM COALESCE(r.created_at, NOW())) * 1000) AS timestamp_msg,
          r.created_at
        FROM impactos_raw r
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
        ORDER BY r.id DESC LIMIT 100
      `, [filtro]);

      // Agrupar en memoria por Hash
      const agrupadosMap = new Map();

      for (const r of rows) {
        const key = r.hash_corto || r.hash_largo || `id_${r.id}`;
        if (!agrupadosMap.has(key)) {
          agrupadosMap.set(key, {
            id: r.id,
            hash_largo: r.hash_largo,
            hash_corto: key,
            url_imagen: r.url_imagen,
            estado: r.estado,
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
          const item = agrupadosMap.get(key);
          item.conteo += 1;
          if (r.estado === 'PROCESADO') item.estado = 'PROCESADO';
          
          // Agregar impacto si no es duplicado exacto de grupo
          const yaExiste = item.impactos.some(i => i.grupo_raw === r.grupo_raw && i.nombre_push === r.nombre_push);
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

      return Array.from(agrupadosMap.values());
    } catch (err) {
      console.error('Error en obtenerRawImagenes:', err.message);
      return [];
    }
  }
