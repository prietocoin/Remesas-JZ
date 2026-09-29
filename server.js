const express = require('express');
const path = require('path');
const { initTasasJZ } = require('./src/config/initDb');
const apiRouter = require('./src/routes/api.router');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar tablas en PostgreSQL (V1 + V2 JSONB)
initTasasJZ();

// Panel V1 Actual
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === Panel V2 Minimalista (Ruta Aislada) ===
app.get('/v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'v2.html'));
});

// Rutas de API (incluye CRUD de directorio, tasas y V2)
app.use('/api', apiRouter);

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`🚀 [Remesas-JZ] Servidor Node activo para JOHN en puerto ${PORT}`));
