const { pool } = require('../../../config/db');

class MatrizRepository {
  async obtenerMatrizCompleta() {
    const resBD = await pool.query('SELECT moneda_origen, moneda_destino, factor FROM jz_factores_matriz;');
    const matriz = {};
    resBD.rows.forEach(r => {
      if (!matriz[r.moneda_origen]) matriz[r.moneda_origen] = {};
      matriz[r.moneda_origen][r.moneda_destino] = parseFloat(r.factor);
    });
    return matriz;
  }

  async actualizarFactores(monedaOrigen, factores) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [destino, val] of Object.entries(factores)) {
        await client.query(`
          INSERT INTO jz_factores_matriz (moneda_origen, moneda_destino, factor) VALUES ($1, $2, $3)
          ON CONFLICT (moneda_origen, moneda_destino) DO UPDATE SET factor = EXCLUDED.factor;
        `, [monedaOrigen.toUpperCase(), destino.toUpperCase(), parseFloat(val)]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new MatrizRepository();
