const visorService = require('./visor.service');

class VisorController {
  async obtenerRawImagenes(req, res) {
    try {
      const rows = await visorService.obtenerRawImagenes();
      return res.json({ success: true, rows });
    } catch (err) {
      console.error('Error en controller obtenerRawImagenes:', err);
      return res.status(500).json({ success: false, error: err.message, rows: [] });
    }
  }

  async obtenerLecturasIA(req, res) {
    try {
      const rows = await visorService.obtenerLecturasIA();
      return res.json({ success: true, rows });
    } catch (err) {
      console.error('Error en controller obtenerLecturasIA:', err);
      return res.status(500).json({ success: false, error: err.message, rows: [] });
    }
  }

  // Aliases compatibles con las rutas de api.router.js
  getRawImagenes(req, res) {
    return this.obtenerRawImagenes(req, res);
  }

  getLecturasIA(req, res) {
    return this.obtenerLecturasIA(req, res);
  }

  async obtenerAsesores(req, res) {
    try {
      const rows = await visorService.obtenerAsesores();
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async obtenerHashes(req, res) {
    try {
      const rows = await visorService.obtenerHashes(req.query);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async obtenerRemesas(req, res) {
    try {
      const rows = await visorService.obtenerRemesas(req.query);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async obtenerTablaGenerica(req, res) {
    try {
      const rows = await visorService.obtenerTablaGenerica(req.params.tabla);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async actualizarRemesa(req, res) {
    try {
      await visorService.actualizarRemesa(req.params.id, req.body);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

const controller = new VisorController();

// Binding explicito para evitar pérdida de contexto en los callbacks de Express
controller.obtenerRawImagenes = controller.obtenerRawImagenes.bind(controller);
controller.obtenerLecturasIA = controller.obtenerLecturasIA.bind(controller);
controller.getRawImagenes = controller.getRawImagenes.bind(controller);
controller.getLecturasIA = controller.getLecturasIA.bind(controller);

module.exports = controller;
