const visorService = require('./visor.service');
const visorRepo = require('./visor.repository');

class VisorController {
  async getRawImagenes(req, res) {
    try {
      const rows = await visorService.getRawImagenes(req.query.instancia || 'JOHN');
      res.json({ success: true, count: rows.length, rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getLecturasIA(req, res) {
    try {
      const rows = await visorService.getLecturasIA(req.query.instancia || 'JOHN');
      res.json({ success: true, count: rows.length, rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getAsesores(req, res) {
    try {
      res.json(await visorRepo.obtenerAsesores());
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async getHashes(req, res) {
    try {
      res.json(await visorRepo.obtenerHashes(req.query));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async getRemesas(req, res) {
    try {
      res.json(await visorRepo.obtenerRemesas(req.query));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async getTablaGenerica(req, res) {
    try {
      res.json(await visorRepo.obtenerTablaGenerica(req.params.nombre));
    } catch (err) { res.status(403).json({ error: err.message }); }
  }

  async updateRemesa(req, res) {
    try {
      await visorRepo.actualizarRemesa(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
}

module.exports = new VisorController();
