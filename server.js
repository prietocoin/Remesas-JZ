const express = require('express');
const path = require('path');
const { initTasasJZ } = require('./src/config/initDb');
const apiRouter = require('./src/routes/api.router');

const app = express();
app.use(express.json({ limit: '10mb' }));

// 1. DESHABILITAR index.html AUTOMÁTICO EN ARCHIVOS ESTÁTICOS
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Inicializar tablas en PostgreSQL (V1 + V2 JSONB)
initTasasJZ();

// === RUTA PRINCIPAL (V2 Predeterminado) ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'v2.html'));
});

// === RUTA DE RESPALDO V1 ===
app.get('/v1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Mantener /v2 por compatibilidad
app.get('/v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'v2.html'));
});

// Rutas de API
app.use('/api', apiRouter);

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`🚀 [Remesas-JZ] Servidor Node activo para JOHN en puerto ${PORT}`));
