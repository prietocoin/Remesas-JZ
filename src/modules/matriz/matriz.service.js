const matrizRepo = require('./matriz.repository');

class MatrizService {
  async obtenerMatriz() {
    return await matrizRepo.obtenerMatrizCompleta();
  }

  async obtenerFactorPar(origen, destino) {
    const matriz = await matrizRepo.obtenerMatrizCompleta();
    if (matriz[origen] && matriz[origen][destino] !== undefined) {
      return matriz[origen][destino];
    }
    return 1.0;
  }

  async guardarFactores(monedaOrigen, factores) {
    await matrizRepo.actualizarFactores(monedaOrigen, factores);
  }
}

module.exports = new MatrizService();
