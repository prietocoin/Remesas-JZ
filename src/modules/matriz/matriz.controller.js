const matrizService = require('./matriz.service');

class MatrizController {
  async getFactores(req, res) {
    try {
      const factores = await matrizService.obtenerMatriz();
      res.json({ success: true, factores });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async updateFactores(req, res) {
    try {
      const { moneda_origen, factores } = req.body;
      if (!moneda_origen || !factores) {
        return res.status(400).json({ success: false, error: 'Parámetros faltantes.' });
      }
      await matrizService.guardarFactores(moneda_origen, factores);
      res.json({ success: true, message: 'Comisiones de JOHN actualizadas.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new MatrizController();
