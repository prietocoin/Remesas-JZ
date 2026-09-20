const { pool } = require('../../config/db');

class LotesRepository {
  async obtenerUltimoLoteOficial() {
    const lastLot = await pool.query(
      `SELECT id_tasa, correo_zelle FROM jz_lotes WHERE id_tasa != 'BORRADOR' ORDER BY timestamp DESC, created_at DESC LIMIT 1;`
    );
    if (lastLot.rows.length === 0) return null;

    const idTasa = lastLot.rows[0].id_tasa;
    const correoZelle = lastLot.rows[0].correo_zelle;
    const rates = await pool.query(`SELECT moneda, tasa_base FROM jz_mercado_tasas WHERE id_tasa = $1;`, [idTasa]);

    const tasasObj = { USD: 1.0, USDT: 1.0 };
    rates.rows.forEach(r => { tasasObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });

    return { id_tasa: idTasa, tasas: tasasObj, correo_zelle: correoZelle };
  }

  async guardarBorrador(rates, correoZelle) {
    const client = await pool.connect();
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      await client.query('BEGIN');
      await client.query("DELETE FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';");
      await client.query("DELETE FROM jz_lotes WHERE id_tasa = 'BORRADOR';");

      await client.query(
        `INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp) VALUES ('BORRADOR', $1, $2);`,
        [correoZelle, timestamp]
      );

      for (const [moneda, valor] of Object.entries(rates)) {
        const numVal = parseFloat(valor);
        if (!isNaN(numVal)) {
          await client.query(
            `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ('BORRADOR', $1, $2, $3);`,
            [moneda.toUpperCase(), numVal, timestamp]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async obtenerBorrador() {
    const lot = await pool.query(`SELECT correo_zelle FROM jz_lotes WHERE id_tasa = 'BORRADOR';`);
    if (lot.rows.length === 0) return null;

    const rates = await pool.query(`SELECT moneda, tasa_base FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';`);
    const ratesObj = {};
    rates.rows.forEach(r => { ratesObj[r.moneda.toUpperCase()] = parseFloat(r.tasa_base); });

    return { rates: ratesObj, correo_zelle: lot.rows[0].correo_zelle };
  }

  async publicarLoteOficial(tasas, correoZelle) {
    const client = await pool.connect();
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      await client.query('BEGIN');

      const lastLot = await client.query(
        `SELECT id_tasa FROM jz_lotes WHERE id_tasa != 'BORRADOR' ORDER BY created_at DESC LIMIT 1;`
      );

      let num = 1;
      if (lastLot.rows.length > 0) {
        const match = lastLot.rows[0].id_tasa.match(/\d+/);
        if (match) num = parseInt(match[0], 10) + 1;
      }
      const idTasaOficial = `T${String(num).padStart(3, '0')}`;

      await client.query(
        `INSERT INTO jz_lotes (id_tasa, correo_zelle, timestamp) VALUES ($1, $2, $3);`,
        [idTasaOficial, correoZelle, timestamp]
      );

      for (const [moneda, valor] of Object.entries(tasas)) {
        await client.query(
          `INSERT INTO jz_mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`,
          [idTasaOficial, moneda.toUpperCase(), parseFloat(valor), timestamp]
        );
      }

      await client.query("DELETE FROM jz_mercado_tasas WHERE id_tasa = 'BORRADOR';");
      await client.query("DELETE FROM jz_lotes WHERE id_tasa = 'BORRADOR';");

      await client.query(
        `INSERT INTO jz_notificaciones (id_tasa, estado) VALUES ($1, 'PENDIENTE');`,
        [idTasaOficial]
      );

      await client.query('COMMIT');
      return idTasaOficial;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new LotesRepository();
