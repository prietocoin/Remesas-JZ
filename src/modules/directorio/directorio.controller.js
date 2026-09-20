const directorioRepo = require('./directorio.repository');

class DirectorioController {
  async getSocioByGrupo(req, res) {
    try {
      const socio = await directorioRepo.obtenerPorGrupoJID(req.params.id_grupo);
      res.json({ success: true, socio });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new DirectorioController();
