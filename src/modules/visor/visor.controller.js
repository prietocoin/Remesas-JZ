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

module.exports = new VisorController();
