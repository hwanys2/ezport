const Queue = require('bull');

// Redis connection (default: localhost:6379)
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// 가격 업데이트 작업 큐 (15초 간격)
const priceUpdateQueue = new Queue('price-update', REDIS_URL, {
  limiter: {
    max: 1, // 한 번에 1개만 처리
    duration: 15000, // 15초 간격
  },
});

// 초기화 작업 큐 (15초 간격)
const seedQueue = new Queue('seed-assets', REDIS_URL, {
  limiter: {
    max: 1,
    duration: 15000, // 15초 간격
  },
});

// 환율 업데이트 큐 (15초 간격)
const exchangeRateQueue = new Queue('exchange-rate', REDIS_URL, {
  limiter: {
    max: 1,
    duration: 15000, // 15초 간격
  },
});

module.exports = {
  priceUpdateQueue,
  seedQueue,
  exchangeRateQueue,
};
