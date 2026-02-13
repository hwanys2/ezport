/* eslint-disable no-console */
const { priceUpdateQueue, seedQueue, exchangeRateQueue, marketIndexQueue } = require('./queue');
const { db } = require('./db');
const { MARKET_INDICES } = require('./market_indices');

// 마지막 Yahoo API 호출 시간 추적 (전역)
let lastYahooApiCall = 0;
const MIN_API_INTERVAL = 15000; // 15초

async function ensureYahooRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastYahooApiCall;

  if (timeSinceLastCall < MIN_API_INTERVAL) {
    const waitTime = MIN_API_INTERVAL - timeSinceLastCall;
    console.log(`[Yahoo API] Waiting ${waitTime}ms to maintain 15s interval...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastYahooApiCall = Date.now();
}

// USD/KRW 환율 조회 함수 (15초 간격 보장)
async function fetchExchangeRate(yahooFinance) {
  try {
    await ensureYahooRateLimit();
    const quote = await yahooFinance.quote('KRW=X'); // USD/KRW 환율
    const rate = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice ?? null;
    
    if (rate && rate > 0) {
      await db.run(`
        INSERT INTO exchange_rates (currency_pair, rate, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (currency_pair) DO UPDATE SET
          rate = excluded.rate,
          updated_at = excluded.updated_at
      `, 'USD/KRW', rate, new Date().toISOString());
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
    await ensureYahooRateLimit();
    const quote = await yahooFinance.quote(symbol);
    const price = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice ?? null;
    const name = quote.shortName || quote.longName || quote.symbol;
    const exchange = quote.fullExchangeName || quote.exchange;
    const currency = quote.currency;
    
    if (price && price > 0) {
      await db.run(`
        INSERT INTO latest_prices (symbol, price, name, exchange, currency, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (symbol) DO UPDATE SET
          price = excluded.price,
          name = excluded.name,
          exchange = excluded.exchange,
          currency = excluded.currency,
          updated_at = excluded.updated_at
      `, symbol, price, name, exchange, currency, new Date().toISOString());
      return { symbol, price, name, exchange, currency };
    }
    return null;
  } catch (error) {
    console.error(`[Yahoo Price] Failed to fetch ${symbol}:`, error?.message || error);
    return null;
  }
}

async function fetchMarketIndexChart(yahooFinance, symbol) {
  try {
    await ensureYahooRateLimit();
    const period2 = Math.floor(Date.now() / 1000);
    const threeYearsInSeconds = 3 * 365 * 24 * 60 * 60;
    const period1 = Math.floor(period2 - threeYearsInSeconds);

    const chart = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: '1d',
    });

    return chart;
  } catch (error) {
    console.error(`[Market Index] Failed to fetch ${symbol}:`, error?.message || error);
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
      try {
        // UPSERT: INSERT 시도, 실패하면 UPDATE
        try {
          const insertResult = await db.run(`
            INSERT INTO assets (symbol, name, name_ko, exchange, currency, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, symbol, result.name, name_ko || null, result.exchange, result.currency, new Date().toISOString());
          console.log(`[Seed Worker] ✓ Inserted into assets table: ${symbol} (${result.name}), rows affected: ${insertResult.changes}`);
        } catch (insertError) {
          // duplicate key 오류인 경우 UPDATE로 처리
          if (insertError.message && (insertError.message.includes('duplicate key') || insertError.message.includes('unique constraint'))) {
            const updateResult = await db.run(`
              UPDATE assets 
              SET name = $1, name_ko = $2, exchange = $3, currency = $4
              WHERE symbol = $5
            `, result.name, name_ko || null, result.exchange, result.currency, symbol);
            if (updateResult.changes > 0) {
              console.log(`[Seed Worker] ✓ Updated assets table: ${symbol} (${result.name}), rows affected: ${updateResult.changes}`);
            } else {
              console.log(`[Seed Worker] ✓ Updated assets table: ${symbol} (${result.name}) - no changes (already up to date)`);
            }
          } else {
            // 다른 오류는 그대로 throw
            throw insertError;
          }
        }
        
        // 저장 확인: assets 테이블에서 실제로 저장되었는지 확인 (여러 방법으로 검증)
        // 약간의 지연을 두어 커밋이 완료되도록 함
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const verifyBySymbol = await db.get('SELECT symbol, name, exchange, currency FROM assets WHERE symbol = $1', symbol);
        const verifyByUpper = await db.get('SELECT symbol, name, exchange, currency FROM assets WHERE UPPER(TRIM(symbol)) = $1', symbol.toUpperCase());
        const verifyByLike = await db.get('SELECT symbol, name, exchange, currency FROM assets WHERE symbol LIKE $1', `%${symbol}%`);
        
        if (verifyBySymbol) {
          console.log(`[Seed Worker] ✓ Verified in assets (by symbol): ${JSON.stringify(verifyBySymbol)}`);
        } else if (verifyByUpper) {
          console.log(`[Seed Worker] ✓ Verified in assets (by UPPER): ${JSON.stringify(verifyByUpper)}`);
        } else if (verifyByLike) {
          console.log(`[Seed Worker] ⚠ Verified in assets (by LIKE): ${JSON.stringify(verifyByLike)} - symbol may have extra characters`);
        } else {
          console.error(`[Seed Worker] ✗ WARNING: ${symbol} not found in assets table after insert/update!`);
          // 추가 디버깅: assets 테이블의 모든 심볼 확인 (DIA와 유사한 것들)
          const allSymbols = await db.all('SELECT symbol FROM assets WHERE symbol LIKE $1 OR UPPER(symbol) LIKE $2 ORDER BY symbol LIMIT 20', `%${symbol}%`, `%${symbol.toUpperCase()}%`);
          console.error(`[Seed Worker] DEBUG: Symbols matching "${symbol}":`, allSymbols.map(a => a.symbol));
          if (allSymbols.length === 0) {
            const sampleSymbols = await db.all('SELECT symbol FROM assets ORDER BY symbol LIMIT 10');
            console.error(`[Seed Worker] DEBUG: Sample symbols in assets table:`, sampleSymbols.map(a => a.symbol));
          }
        }
        
        await db.run(`
          INSERT INTO latest_prices (symbol, price, name, exchange, currency, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (symbol) DO UPDATE SET
            price = excluded.price,
            name = excluded.name,
            exchange = excluded.exchange,
            currency = excluded.currency,
            updated_at = excluded.updated_at
        `, symbol, result.price, result.name, result.exchange, result.currency, new Date().toISOString());
        
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

function setupMarketIndexWorker(yahooFinance) {
  marketIndexQueue.process(async (job) => {
    const { symbol } = job.data;
    const indexInfo = MARKET_INDICES.find((entry) => entry.symbol === symbol);

    if (!indexInfo) {
      console.warn(`[Market Index Worker] Unknown symbol requested: ${symbol}`);
      return { success: false, symbol, reason: 'unknown-symbol' };
    }

    console.log(`[Market Index Worker] Updating ${indexInfo.shortLabel} (${symbol})...`);

    const chart = await fetchMarketIndexChart(yahooFinance, symbol);

    if (!chart || !Array.isArray(chart.quotes) || chart.quotes.length === 0) {
      console.warn(`[Market Index Worker] ✗ ${indexInfo.shortLabel} (${symbol}) - no chart data`);
      return { success: false, symbol, reason: 'no-data' };
    }

    const high3y = chart.quotes.reduce((maxHigh, quote) => {
      if (typeof quote.high === 'number' && !Number.isNaN(quote.high)) {
        return quote.high > maxHigh ? quote.high : maxHigh;
      }
      return maxHigh;
    }, 0);

    const lastQuote = chart.quotes[chart.quotes.length - 1] || {};
    const currentPriceCandidate = chart.meta?.regularMarketPrice ?? lastQuote.close ?? null;
    const currentPrice =
      typeof currentPriceCandidate === 'number' && !Number.isNaN(currentPriceCandidate)
        ? currentPriceCandidate
        : null;

    const percentDrop =
      currentPrice != null && high3y > 0
        ? ((currentPrice / high3y) - 1) * 100
        : null;

    const exchange =
      chart.meta?.exchangeName ||
      chart.meta?.fullExchangeName ||
      chart.meta?.exchange ||
      null;

    const currency = chart.meta?.currency || null;
    const updatedAt = new Date().toISOString();

    await db.run(`
      INSERT INTO index_metrics (
        symbol,
        slug,
        label,
        short_label,
        region,
        current_price,
        high_3y,
        percent_drop,
        currency,
        exchange,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (symbol) DO UPDATE SET
        slug = excluded.slug,
        label = excluded.label,
        short_label = excluded.short_label,
        region = excluded.region,
        current_price = excluded.current_price,
        high_3y = excluded.high_3y,
        percent_drop = excluded.percent_drop,
        currency = excluded.currency,
        exchange = excluded.exchange,
        updated_at = excluded.updated_at
    `,
      symbol,
      indexInfo.slug,
      indexInfo.label,
      indexInfo.shortLabel,
      indexInfo.region,
      currentPrice,
      high3y || null,
      percentDrop,
      currency,
      exchange,
      updatedAt
    );

    console.log(`[Market Index Worker] ✓ ${indexInfo.shortLabel} updated`);
    return {
      success: true,
      symbol,
      currentPrice,
      high3y,
      percentDrop,
      updatedAt,
    };
  });

  marketIndexQueue.on('completed', (job, result) => {
    if (result?.success) {
      console.log(`[Market Index Queue] Completed: ${result.symbol}`);
    }
  });

  marketIndexQueue.on('failed', (job, err) => {
    console.error(`[Market Index Queue] Failed (${job?.data?.symbol || 'unknown'}):`, err?.message || err);
  });

  console.log('[Worker] Market index worker started');
}

module.exports = {
  setupPriceUpdateWorker,
  setupSeedWorker,
  setupExchangeRateWorker,
  fetchExchangeRate,
  fetchYahooPrice,
  setupMarketIndexWorker,
};
