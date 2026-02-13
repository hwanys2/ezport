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

// 초기화 작업 큐: 전역 15초 간격 순차 처리 (모든 사용자 요청이 한 큐에서 1건씩 처리)
const seedQueue = new Queue('seed-assets', REDIS_URL, {
  limiter: {
    max: 1,
    duration: 15000, // 15초에 최대 1건만 처리 → 10명이 동시에 요청해도 큐에 쌓였다가 순서대로 처리
  },
});

// 환율 업데이트 큐 (15초 간격)
const exchangeRateQueue = new Queue('exchange-rate', REDIS_URL, {
  limiter: {
    max: 1,
    duration: 15000, // 15초 간격
  },
});

// 주요 지수 업데이트 큐 (15초 간격)
const marketIndexQueue = new Queue('market-index', REDIS_URL, {
  limiter: {
    max: 1,
    duration: 15000, // 15초 간격
  },
});

module.exports = {
  priceUpdateQueue,
  seedQueue,
  exchangeRateQueue,
  marketIndexQueue,
};
