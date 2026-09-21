const { pool } = require('../../config/db');

class DirectorioRepository {
  // Obtener todos los registros del directorio
  async obtenerTodos() {
    const { rows } = await pool.query(
      `SELECT * FROM jz_directorio ORDER BY creado_en DESC NULLS LAST`
    );
    return rows;
  }

  // Buscar por nombre de asesor/socio
  async obtenerPorNombre(nombre) {
    const { rows } = await pool.query(
      `SELECT * FROM jz_directorio WHERE nombre = $1 LIMIT 1`,
      [nombre]
    );
    return rows[0] || null;
  }

  // Buscar por ID de grupo o JID
  async obtenerPorGrupoJID(grupoJID) {
    const { rows } = await pool.query(
      `SELECT * FROM jz_directorio WHERE TRIM(id_grupo) = TRIM($1) LIMIT 1`,
      [grupoJID]
    );
    return rows[0] || null;
  }

  // Crear un nuevo socio o actualizar si ya existe el id_grupo
  async guardar(datos) {
    const { 
      id_grupo, nombre, roles, moneda_socio, 
      grupo, porcentaje_comision, descuento, moneda_base 
    } = datos;

    const { rows } = await pool.query(
      `INSERT INTO jz_directorio (
         id_grupo, nombre, roles, moneda_socio, 
         grupo, porcentaje_comision, descuento, moneda_base, creado_en
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id_grupo) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         roles = EXCLUDED.roles,
         moneda_socio = EXCLUDED.moneda_socio,
         grupo = EXCLUDED.grupo,
         porcentaje_comision = EXCLUDED.porcentaje_comision,
         descuento = EXCLUDED.descuento,
         moneda_base = EXCLUDED.moneda_base
       RETURNING *`,
      [
        id_grupo, 
        nombre || 'Nuevo Socio', 
        roles || 'Socio', 
        moneda_socio || 'USD', 
        grupo || '', 
        porcentaje_comision || '0', 
        descuento || '0', 
        moneda_base || 'USD'
      ]
    );
    return rows[0];
  }

  // Actualizar socio existente por id_grupo
  async actualizar(id_grupo, datos) {
    const { 
      nombre, roles, moneda_socio, grupo, 
      porcentaje_comision, descuento, moneda_base 
    } = datos;

    const { rows } = await pool.query(
      `UPDATE jz_directorio SET
         nombre = $1, 
         roles = $2, 
         moneda_socio = $3, 
         grupo = $4,
         porcentaje_comision = $5, 
         descuento = $6, 
         moneda_base = $7
       WHERE TRIM(id_grupo) = TRIM($8)
       RETURNING *`,
      [nombre, roles, moneda_socio, grupo, porcentaje_comision, descuento, moneda_base, id_grupo]
    );
    return rows[0];
  }

  // Eliminar socio por id_grupo
  async eliminar(id_grupo) {
    await pool.query(`DELETE FROM jz_directorio WHERE TRIM(id_grupo) = TRIM($1)`, [id_grupo]);
    return true;
  }
}

module.exports = new DirectorioRepository();
