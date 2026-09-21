const directorioRepo = require('./directorio.repository');

class DirectorioController {
  // Obtener un socio por su ID de grupo/JID (método existente)
  async getSocioByGrupo(req, res) {
    try {
      const socio = await directorioRepo.obtenerPorGrupoJID(req.params.id_grupo);
      res.json({ success: true, socio });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Obtener la lista completa de socios
  async getAll(req, res) {
    try {
      const rows = await directorioRepo.obtenerTodos();
      res.json({ success: true, rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Crear o guardar un socio
  async guardar(req, res) {
    try {
      const socio = await directorioRepo.guardar(req.body);
      res.json({ success: true, socio });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Actualizar un socio existente por id_grupo
  async actualizar(req, res) {
    try {
      const socio = await directorioRepo.actualizar(req.params.id_grupo, req.body);
      res.json({ success: true, socio });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Eliminar un socio por id_grupo
  async eliminar(req, res) {
    try {
      await directorioRepo.eliminar(req.params.id_grupo);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new DirectorioController();
