require('dotenv').config();
const { iniciarWorkerJOHN } = require('./src/workers/jz.worker');

console.log('⚡ === Iniciando Módulo de Tasas JOHN (Plug & Play Worker) ===');
iniciarWorkerJOHN();
