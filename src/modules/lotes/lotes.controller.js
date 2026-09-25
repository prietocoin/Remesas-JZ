const lotesService = require('./lotes.service');

class LotesController {
  async getUltimasTasas(req, res) {
    try {
      const data = await lotesService.obtenerUltimasTasas();
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async syncBinance(req, res) {
    try {
      const data = await lotesService.sincronizarBinance();
      res.json({ success: true, message: 'Borrador cargado desde Binance API.', ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async webhookN8N(req, res) {
    try {
      await lotesService.procesarWebhookN8N(req.body);
      res.json({ success: true, message: 'Borrador cargado en jz_lotes y jz_mercado_tasas.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getBorrador(req, res) {
    try {
      const data = await lotesService.obtenerBorradorPendiente();
      if (!data) return res.status(404).json({ success: false, msg: 'Sin borrador pendiente.' });
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async publicar(req, res) {
    try {
      const { tasas, correo_zelle } = req.body;
      const idTasaOficial = await lotesService.publicarLote(tasas, correo_zelle);
      res.json({ success: true, message: `Lote ${idTasaOficial} publicado con éxito para JOHN.` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async guardarCalculadas(req, res) {
    try {
      const { id_tasa, correo_zelle, valores_finales } = req.body;
      if (!id_tasa || !valores_finales) {
        return res.status(400).json({ success: false, error: 'Faltan parámetros requeridos (id_tasa o valores_finales).' });
      }
      await lotesService.guardarCalculadas(id_tasa, correo_zelle, valores_finales);
      res.json({ success: true, message: 'Valores calculados guardados correctamente.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new LotesController();
