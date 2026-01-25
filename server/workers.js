/* eslint-disable no-console */
const { priceUpdateQueue, seedQueue, exchangeRateQueue } = require('./queue');
const { db } = require('./db');

// 마지막 Yahoo API 호출 시간 추적 (전역)
let lastYahooApiCall = 0;
const MIN_API_INTERVAL = 15000; // 15초

// USD/KRW 환율 조회 함수 (15초 간격 보장)
async function fetchExchangeRate(yahooFinance) {
  try {
    const now = Date.now();
    const timeSinceLastCall = now - lastYahooApiCall;
    
    if (timeSinceLastCall < MIN_API_INTERVAL) {
      const waitTime = MIN_API_INTERVAL - timeSinceLastCall;
      console.log(`[Yahoo API] Waiting ${waitTime}ms to maintain 15s interval...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    
    lastYahooApiCall = Date.now();
    const quote = await yahooFinance.quote('KRW=X'); // USD/KRW 환율
    const rate = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice ?? null;
    
    if (rate && rate > 0) {
      const upsert = db.prepare(`
        INSERT INTO exchange_rates (currency_pair, rate, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(currency_pair) DO UPDATE SET
          rate = excluded.rate,
          updated_at = excluded.updated_at
      `);
      upsert.run('USD/KRW', rate, new Date().toISOString());
      console.log(`[Exchange Rate] USD/KRW updated: ${rate}`);
      return rate;
    }
    return null;
  } catch (error) {
    console.error(`[Exchange Rate] Failed to fetch USD/KRW:`, error?.message || error);
    return null;
  }
}

// Yahoo Finance 가격 조회 함수 (15초 간격 보장)
async function fetchYahooPrice(yahooFinance, symbol) {
  try {
    const now = Date.now();
    const timeSinceLastCall = now - lastYahooApiCall;
    
    if (timeSinceLastCall < MIN_API_INTERVAL) {
      const waitTime = MIN_API_INTERVAL - timeSinceLastCall;
      console.log(`[Yahoo API] Waiting ${waitTime}ms to maintain 15s interval...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    
    lastYahooApiCall = Date.now();
    const quote = await yahooFinance.quote(symbol);
    const price = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice ?? null;
    const name = quote.shortName || quote.longName || quote.symbol;
    const exchange = quote.fullExchangeName || quote.exchange;
    const currency = quote.currency;
    
    if (price && price > 0) {
      const upsert = db.prepare(`
        INSERT INTO latest_prices (symbol, price, name, exchange, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          price = excluded.price,
          name = excluded.name,
          exchange = excluded.exchange,
          currency = excluded.currency,
          updated_at = excluded.updated_at
      `);
      upsert.run(symbol, price, name, exchange, currency, new Date().toISOString());
      return { symbol, price, name, exchange, currency };
    }
    return null;
  } catch (error) {
    console.error(`[Yahoo Price] Failed to fetch ${symbol}:`, error?.message || error);
    return null;
  }
}

// 가격 업데이트 워커 설정
function setupPriceUpdateWorker(yahooFinance) {
  priceUpdateQueue.process(async (job) => {
    const { symbol } = job.data;
    console.log(`[Price Worker] Updating ${symbol}...`);
    
    const result = await fetchYahooPrice(yahooFinance, symbol);
    if (result) {
      console.log(`[Price Worker] ✓ ${symbol} updated: ${result.price}`);
      return { success: true, symbol };
    }
    
    console.warn(`[Price Worker] ✗ ${symbol} failed`);
    return { success: false, symbol };
  });

  priceUpdateQueue.on('completed', (job, result) => {
    if (result.success) {
      console.log(`[Queue] Completed: ${result.symbol}`);
    }
  });

  priceUpdateQueue.on('failed', (job, err) => {
    console.error(`[Queue] Failed:`, err?.message || err);
  });

  console.log('[Worker] Price update worker started');
}

// 초기화 워커 설정 (KRX 종목 및 미국 주식 등록)
function setupSeedWorker(yahooFinance) {
  seedQueue.process(async (job) => {
    const { code, name_ko, market, yahoo_suffix } = job.data;
    
    const symbol = yahoo_suffix ? `${code}.${yahoo_suffix}` : code;
    const displayName = name_ko || code;
    
    console.log(`[Seed Worker] Registering ${symbol} (${displayName})...`);
    
    const result = await fetchYahooPrice(yahooFinance, symbol);
    if (result) {
      const upsert = db.prepare(`
        INSERT INTO assets (symbol, name, name_ko, exchange, currency, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          name = excluded.name,
          name_ko = excluded.name_ko,
          exchange = excluded.exchange,
          currency = excluded.currency
      `);
      
      try {
        upsert.run(symbol, result.name, name_ko || null, result.exchange, result.currency, new Date().toISOString());
        
        const upsertPrice = db.prepare(`
          INSERT INTO latest_prices (symbol, price, name, exchange, currency, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            price = excluded.price,
            name = excluded.name,
            exchange = excluded.exchange,
            currency = excluded.currency,
            updated_at = excluded.updated_at
        `);
        upsertPrice.run(symbol, result.price, result.name, result.exchange, result.currency, new Date().toISOString());
        
        console.log(`[Seed Worker] ✓ ${symbol} (${displayName}) registered: ${result.price}`);
        return { success: true, symbol, name_ko: displayName };
      } catch (error) {
        console.error(`[Seed Worker] DB error for ${symbol}:`, error?.message);
        return { success: false, symbol };
      }
    }
    
    console.warn(`[Seed Worker] ✗ ${symbol} (${displayName}) failed`);
    return { success: false, symbol };
  });

  seedQueue.on('completed', (job, result) => {
    if (result.success) {
      console.log(`[Seed Queue] Completed: ${result.symbol}`);
    }
  });

  seedQueue.on('failed', (job, err) => {
    console.error(`[Seed Queue] Failed:`, err?.message || err);
  });

  console.log('[Worker] Seed worker started');
}

// 환율 업데이트 워커 설정
function setupExchangeRateWorker(yahooFinance) {
  exchangeRateQueue.process(async (job) => {
    console.log('[Exchange Rate Worker] Updating USD/KRW...');
    
    const rate = await fetchExchangeRate(yahooFinance);
    if (rate) {
      return { success: true, rate };
    }
    
    console.warn('[Exchange Rate Worker] ✗ USD/KRW failed');
    return { success: false };
  });

  exchangeRateQueue.on('completed', (job, result) => {
    if (result.success) {
      console.log(`[Exchange Rate Queue] Completed: USD/KRW = ${result.rate}`);
    }
  });

  exchangeRateQueue.on('failed', (job, err) => {
    console.error(`[Exchange Rate Queue] Failed:`, err?.message || err);
  });

  console.log('[Worker] Exchange rate worker started');
}

module.exports = {
  setupPriceUpdateWorker,
  setupSeedWorker,
  setupExchangeRateWorker,
  fetchExchangeRate,
  fetchYahooPrice,
};
