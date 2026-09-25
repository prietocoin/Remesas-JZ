const lotesRepo = require('./lotes.repository');
const { obtenerTasasBinance } = require('./providers/binance.provider');

class LotesService {
  async obtenerUltimasTasas() {
    const lote = await lotesRepo.obtenerUltimoLoteOficial();
    if (!lote) {
      return { id_tasa: 'T001', tasas: { USD: 1.0, USDT: 1.0 }, correo_zelle: 'GM Sports 21 LLC' };
    }
    return lote;
  }

  async sincronizarBinance() {
    const rates = await obtenerTasasBinance();
    const correo = 'GM Sports 21 LLC';
    await lotesRepo.guardarBorrador(rates, correo);
    return { rates, correo_zelle: correo };
  }

  async procesarWebhookN8N(payload) {
    const data = Array.isArray(payload) ? payload[0] : payload;
    const rates = data?.rates || data?.json || data || {};
    const correoZelle = data?.correo_zelle || data?.correoZelle || 'GM Sports 21 LLC';
    await lotesRepo.guardarBorrador(rates, correoZelle);
  }

  async obtenerBorradorPendiente() {
    return await lotesRepo.obtenerBorrador();
  }

  async publicarLote(tasas, correoZelle) {
    return await lotesRepo.publicarLoteOficial(tasas, correoZelle || 'GM Sports 21 LLC');
  }

  async guardarCalculadas(idTasa, correoZelle, valoresFinales) {
    return await lotesRepo.guardarCalculadas(idTasa, correoZelle || 'GM Sports 21 LLC', valoresFinales);
  }
}

module.exports = new LotesService();
