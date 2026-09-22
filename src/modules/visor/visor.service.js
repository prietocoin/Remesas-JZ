const visorRepository = require('./visor.repository');

class VisorService {
  async obtenerRawImagenes(instancia) {
    return await visorRepository.obtenerRawImagenes(instancia);
  }

  async obtenerLecturasIA(instancia) {
    return await visorRepository.obtenerLecturasIA(instancia);
  }

  async actualizarLecturaIA(hash, datos) {
    return await visorRepository.actualizarLecturaIA(hash, datos);
  }

  async eliminarLecturaIA(hash) {
    return await visorRepository.eliminarLecturaIA(hash);
  }

  async obtenerAsesores() {
    return await visorRepository.obtenerAsesores();
  }

  async obtenerHashes(filtros) {
    return await visorRepository.obtenerHashes(filtros);
  }

  async obtenerRemesas(filtros) {
    return await visorRepository.obtenerRemesas(filtros);
  }

  async obtenerTablaGenerica(tabla) {
    return await visorRepository.obtenerTablaGenerica(tabla);
  }

  async actualizarRemesa(id, datos) {
    return await visorRepository.actualizarRemesa(id, datos);
  }
}

module.exports = new VisorService();
