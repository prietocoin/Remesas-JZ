const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-db',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  database: process.env.DB_NAME || 'automatizaciones',
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 4000,
});

pool.on('error', (err) => {
  console.error('❌ [PostgreSQL Pool Error]:', err.message);
});

module.exports = { pool };
