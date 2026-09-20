const redisConfig = {
  host: process.env.REDIS_HOST || 'redis-db',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

module.exports = { redisConfig };
