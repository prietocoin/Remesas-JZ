// ==========================================
// MÓDULO V2 (PARALELO JSONB + NOTIFICACIÓN N8N)
// ==========================================

// Obtener el lote activo (con fallback automático a V1)
router.get('/v2/tasas/activo', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_tasa, correo_zelle, titular_zelle, created_at, contenido 
       FROM jz_lotes_v2 ORDER BY created_at DESC LIMIT 1;`
    );

    if (rows.length > 0 && rows[0].contenido) {
      return res.json({ success: true, lote: rows[0].contenido });
    }

    // Fallback: Cargar valores del lote activo V1 para precargar la vista V2
    const v1Lot = await pool.query(
      `SELECT id_tasa, correo_zelle FROM jz_lotes WHERE id_tasa != 'BORRADOR' ORDER BY created_at DESC LIMIT 1;`
    );

    if (v1Lot.rows.length > 0) {
      const idTasa = v1Lot.rows[0].id_tasa;
      const ratesRes = await pool.query(`SELECT moneda, tasa_base FROM jz_mercado_tasas WHERE id_tasa = $1;`, [idTasa]);
      const calcRes = await pool.query(`SELECT valores_finales FROM jz_tasas_calculadas WHERE id_tasa = $1 ORDER BY id DESC LIMIT 1;`, [idTasa]);

      const basesObj = {};
      ratesRes.rows.forEach(r => { basesObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });
      const finalesV1 = calcRes.rows[0]?.valores_finales || {};

      return res.json({
        success: true,
        lote: {
          id_tasa: idTasa,
          titular_zelle: 'GM Sports 21 LLC',
          correo_zelle: v1Lot.rows[0].correo_zelle || 'gmsports21sp2@dulceh.com',
          monedas_base: {
            USD: basesObj.USD || 1.0,
            PEN: basesObj.PEN || 3.44,
            VES: basesObj.VES || 954.0,
            COP: basesObj.COP || 3320.0
          },
          bases_manuales: {
            PYP_VES: basesObj.PYP || parseFloat(finalesV1.PYP_VES) || 800,
            ESP_VES: basesObj.ESP || parseFloat(finalesV1.ESP_VES) || 1030,
            BIZ_VES: basesObj.BIZ || parseFloat(finalesV1.BIZ_VES) || 960,
            PEN_COP: basesObj.PEN_COP || parseFloat(finalesV1.PEN_COP) || 920,
            VES_PEN: basesObj.VES_PEN || parseFloat(finalesV1.VES_PEN) || 297,
            MXN_VES: basesObj.MXN || parseFloat(finalesV1.MXN_VES) || 49.3,
            ARS_VES: basesObj.ARS || parseFloat(finalesV1.ARS_VES) || 0,
            PEN_CLP: basesObj.PEN_CLP || parseFloat(finalesV1.PEN_CLP) || 265,
            COP_PEN: basesObj.COP_PEN || parseFloat(finalesV1.COP_PEN) || 1080,
            COP_VES: basesObj.COP_VES || parseFloat(finalesV1.COP_VES) || 3.48
          },
          comisiones: {
            USD_VES: { pct: 10.5, esSuma: false }, PEN_VES: { pct: 6.0, esSuma: false },
            USD_PEN: { pct: 10.5, esSuma: false }, USD_COP: { pct: 10.5, esSuma: false },
            PYP_VES: { pct: 6.0, esSuma: false }, ESP_VES: { pct: 6.0, esSuma: false },
            BIZ_VES: { pct: 6.0, esSuma: false }, PEN_COP: { pct: 6.0, esSuma: false },
            VES_PEN: { pct: 0.0, esSuma: false }, MXN_VES: { pct: 6.0, esSuma: false },
            ARS_VES: { pct: 6.0, esSuma: false }, PEN_CLP: { pct: 6.0, esSuma: false },
            COP_PEN: { pct: 0.0, esSuma: false }, COP_VES: { pct: 6.0, esSuma: true },
            ZX_PEN_VES: { pct: 7.0, esSuma: false }, JZ_PEN_VES: { pct: 3.9, esSuma: false },
            JZ_USD_VES: { pct: 8.5, esSuma: false }, JZ_COP_VES: { pct: 4.0, esSuma: true }
          },
          tasas_finales: finalesV1
        }
      });
    }

    return res.json({ success: true, lote: null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Publicar Lote V2 con soporte completo para n8n
router.post('/v2/tasas/publicar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { correo_zelle, titular_zelle, monedas_base, bases_manuales, comisiones, tasas_finales } = req.body;

    await client.query('BEGIN');

    // Calcular siguiente ID de lote (ej. T087)
    const lastLot = await client.query(`SELECT id_tasa FROM jz_lotes_v2 ORDER BY created_at DESC LIMIT 1;`);
    let num = 1;
    if (lastLot.rows.length > 0) {
      const match = lastLot.rows[0].id_tasa.match(/\d+/);
      if (match) num = parseInt(match[0], 10) + 1;
    }
    const nuevoIdTasa = `T${String(num).padStart(3, '0')}`;

    const documentoLote = {
      id_tasa: nuevoIdTasa,
      correo_zelle: correo_zelle || 'gmsports21sp2@dulceh.com',
      titular_zelle: titular_zelle || 'GM Sports 21 LLC',
      fechahora: new Date().toISOString(),
      monedas_base,
      bases_manuales,
      comisiones,
      tasas_finales
    };

    // 1. Guardar lote completo en JSONB
    await client.query(
      `INSERT INTO jz_lotes_v2 (id_tasa, correo_zelle, titular_zelle, contenido) VALUES ($1, $2, $3, $4::jsonb);`,
      [nuevoIdTasa, documentoLote.correo_zelle, documentoLote.titular_zelle, JSON.stringify(documentoLote)]
    );

    // 2. Guardar en jz_tasas_calculadas para que n8n pueda leer los valores
    await client.query(
      `INSERT INTO jz_tasas_calculadas (id_tasa, correo_zelle, valores_finales, actualizado_en) VALUES ($1, $2, $3::jsonb, NOW());`,
      [nuevoIdTasa, documentoLote.correo_zelle, JSON.stringify(tasas_finales)]
    );

    // 3. Disparar notificacion para activar el flujo de carteles en n8n
    await client.query(
      `INSERT INTO jz_notificaciones (id_tasa, estado) VALUES ($1, 'PENDIENTE');`,
      [nuevoIdTasa]
    );

    await client.query('COMMIT');

    return res.json({ 
      success: true, 
      id_tasa: nuevoIdTasa, 
      message: `🚀 Lote ${nuevoIdTasa} publicado. Carteles n8n activados.`,
      lote: documentoLote 
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});
