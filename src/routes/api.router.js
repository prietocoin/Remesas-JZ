const { Router } = require('express');
const lotesController = require('../modules/lotes/lotes.controller');
const matrizController = require('../modules/matriz/matriz.controller');
const visorController = require('../modules/visor/visor.controller');
const directorioController = require('../modules/directorio/directorio.controller');

const router = Router();

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
