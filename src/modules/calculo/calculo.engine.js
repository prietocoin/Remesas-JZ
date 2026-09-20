const lotesService = require('../lotes/lotes.service');
const matrizService = require('../matriz/matriz.service');
const directorioService = require('../directorio/directorio.service');

class CalculoEngine {
  async calcularConversion({ montoExtraido, monedaOrigen, monedaDestino, nombreAsesor }) {
    const lote = await lotesService.obtenerUltimasTasas();
    const factorMatriz = await matrizService.obtenerFactorPar(monedaOrigen, monedaDestino);
    const { comision, descuento } = await directorioService.obtenerAjustesAsesor(nombreAsesor);

    const tasaOrigen = lote.tasas[monedaOrigen.toUpperCase()] || 1;
    const tasaDestino = lote.tasas[monedaDestino.toUpperCase()] || 1;

    let tasaFinal = (1 / tasaOrigen) * tasaDestino * factorMatriz;
    if (descuento > 0) tasaFinal -= descuento;
    if (comision > 0) tasaFinal = tasaFinal * (1 - (comision / 100));

    const montoCalculado = Number((montoExtraido * tasaFinal).toFixed(2));

    return {
      id_tasa_lote: lote.id_tasa,
      tasa_aplicada: Number(tasaFinal.toFixed(4)),
      factor_matriz: factorMatriz,
      descuento_aplicado: descuento,
      comision_aplicada: comision,
      monto_final: montoCalculado
    };
  }
}

module.exports = new CalculoEngine();
