const { Router } = require('express');
const { pool } = require('../config/db');
const lotesController = require('../modules/lotes/lotes.controller');
const matrizController = require('../modules/matriz/matriz.controller');
const visorController = require('../modules/visor/visor.controller');
const directorioController = require('../modules/directorio/directorio.controller');

const router = Router();

// ==========================================
// MÓDULO V2 (PARALELO JSONB)
// ==========================================

// Obtener el lote activo publicado en V2
router.get('/v2/tasas/activo', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_tasa, correo_zelle, titular_zelle, created_at, contenido 
       FROM jz_lotes_v2 
       ORDER BY created_at DESC LIMIT 1;`
    );
    return res.json({ 
      success: true, 
      lote: rows[0]?.contenido || null 
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Publicar lote completo V2 en un solo paso
router.post('/v2/tasas/publicar', async (req, res) => {
  try {
    const { correo_zelle, titular_zelle, monedas_base, comisiones, tasas_finales } = req.body;

    if (!monedas_base || !tasas_finales) {
      return res.status(400).json({ success: false, error: 'Faltan datos requeridos en el lote.' });
    }

    // Calcular siguiente ID de lote
    const lastLot = await pool.query(`SELECT id_tasa FROM jz_lotes_v2 ORDER BY created_at DESC LIMIT 1;`);
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
      comisiones,
      tasas_finales
    };

    await pool.query(
      `INSERT INTO jz_lotes_v2 (id_tasa, correo_zelle, titular_zelle, contenido) 
       VALUES ($1, $2, $3, $4::jsonb);`,
      [
        nuevoIdTasa, 
        documentoLote.correo_zelle, 
        documentoLote.titular_zelle, 
        JSON.stringify(documentoLote)
      ]
    );

    return res.json({ 
      success: true, 
      id_tasa: nuevoIdTasa, 
      message: `🚀 Lote ${nuevoIdTasa} publicado con éxito en V2.`,
      lote: documentoLote 
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// MÓDULO V1 (EXISTENTE - INTACTO)
// ==========================================

// Módulo Lotes & Tasas
router.get('/tasas/ultimas', (req, res) => lotesController.getUltimasTasas(req, res));
router.post('/tasas/binance', (req, res) => lotesController.syncBinance(req, res));
router.post('/tasas/n8n-webhook', (req, res) => lotesController.webhookN8N(req, res));
router.get('/tasas/fetch-hoo', (req, res) => lotesController.getBorrador(req, res));
router.post('/tasas/publicar', (req, res) => lotesController.publicar(req, res));
router.post('/tasas/calculadas', (req, res) => lotesController.guardarCalculadas(req, res));

// Módulo Matriz & Factores
router.get('/tasas/factores', (req, res) => matrizController.getFactores(req, res));
router.post('/tasas/factores', (req, res) => matrizController.updateFactores(req, res));

// Módulo Directorio
router.get('/directorio', (req, res) => directorioController.getAll(req, res));
router.post('/directorio', (req, res) => directorioController.guardar(req, res));
router.put('/directorio/:id_grupo', (req, res) => directorioController.actualizar(req, res));
router.delete('/directorio/:id_grupo', (req, res) => directorioController.eliminar(req, res));
router.get('/directorio/grupo/:id_grupo', (req, res) => directorioController.getSocioByGrupo(req, res));

// Módulo Visor & Auditoría (Instancia JOHN)
router.get('/raw-imagenes', (req, res) => visorController.getRawImagenes(req, res));
router.get('/lecturas-ia', (req, res) => visorController.getLecturasIA(req, res));
router.put('/lecturas-ia/:hash', (req, res) => visorController.actualizarLecturaIA(req, res));
router.delete('/lecturas-ia/:hash', (req, res) => visorController.eliminarLecturaIA(req, res));
router.get('/asesores', (req, res) => visorController.obtenerAsesores(req, res));
router.get('/hashes', (req, res) => visorController.obtenerHashes(req, res));
router.get('/remesas', (req, res) => visorController.obtenerRemesas(req, res));
router.get('/tabla/:nombre', (req, res) => visorController.obtenerTablaGenerica(req, res));
router.put('/remesas/:id', (req, res) => visorController.actualizarRemesa(req, res));

module.exports = router;
