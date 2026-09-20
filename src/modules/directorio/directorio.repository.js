const { pool } = require('../../config/db');

class DirectorioRepository {
  async obtenerPorNombre(nombre) {
    const { rows } = await pool.query(
      `SELECT * FROM jz_directorio WHERE nombre = $1 LIMIT 1`,
      [nombre]
    );
    return rows[0] || null;
  }

  async obtenerPorGrupoJID(grupoJID) {
    const { rows } = await pool.query(
      `SELECT * FROM jz_directorio WHERE TRIM(id_grupo) = TRIM($1) LIMIT 1`,
      [grupoJID]
    );
    return rows[0] || null;
  }
}

module.exports = new DirectorioRepository();
