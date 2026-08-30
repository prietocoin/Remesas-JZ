// Endpoint: Obtener lista de asesores
app.get('/api/asesores', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT nombre_asesor FROM remesas WHERE nombre_asesor IS NOT NULL ORDER BY nombre_asesor');
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/asesores:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Obtener remesas
app.get('/api/remesas', async (req, res) => {
  try {
    const { asesor } = req.query;
    let query = 'SELECT * FROM remesas';
    let params = [];

    if (asesor) {
      query += ' WHERE nombre_asesor = $1';
      params.push(asesor);
    }
    query += ' ORDER BY id DESC LIMIT 100';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error en /api/remesas:', err.message);
    res.status(500).json({ error: err.message });
  }
});
