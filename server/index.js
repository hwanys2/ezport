const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const yahooFinanceModule = require('yahoo-finance2');
const { z } = require('zod');
const path = require('path');
const { db, initDb } = require('./db');
const { searchAssets } = require('./search_handler');
const { priceUpdateQueue, exchangeRateQueue, seedQueue, marketIndexQueue } = require('./queue');
const {
  setupPriceUpdateWorker,
  setupExchangeRateWorker,
  setupSeedWorker,
  setupMarketIndexWorker,
} = require('./workers');
const { MARKET_INDICES } = require('./market_indices');
const { getStateLabel } = require('./index_state');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const YahooFinanceCtor = yahooFinanceModule?.default || yahooFinanceModule;
const yahooFinance = new YahooFinanceCtor({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const MARKET_INDEX_CACHE_MINUTES = 60;

// 서버 시작 시 큐 상태 확인 및 워커 시작 (큐 작업은 이어서 실행)
(async () => {
  // 데이터베이스 초기화 (재시도 로직 포함)
  let dbInitialized = false;
  let retries = 5;
  while (!dbInitialized && retries > 0) {
    try {
      await initDb();
      dbInitialized = true;
      console.log('[Init] Database initialized successfully');
    } catch (error) {
      retries--;
      if (retries > 0) {
        console.warn(`[Init] Database initialization failed, retrying in 3 seconds... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.error('[Init] Database initialization failed after all retries:', error.message);
        console.error('[Init] Please check PostgreSQL service connection in Railway');
      }
    }
  }

  try {
    
    const seedCounts = await seedQueue.getJobCounts();
    const priceCounts = await priceUpdateQueue.getJobCounts();
    const exchangeCounts = await exchangeRateQueue.getJobCounts();
    const marketIndexCounts = await marketIndexQueue.getJobCounts();
    
    const totalSeed = seedCounts.waiting + seedCounts.active + seedCounts.delayed;
    const totalPrice = priceCounts.waiting + priceCounts.active + priceCounts.delayed;
    const totalExchange = exchangeCounts.waiting + exchangeCounts.active + exchangeCounts.delayed;
    const totalMarketIndex = marketIndexCounts.waiting + marketIndexCounts.active + marketIndexCounts.delayed;
    
    if (totalSeed > 0 || totalPrice > 0 || totalExchange > 0 || totalMarketIndex > 0) {
      console.log(`[Init] 큐 상태 확인:`);
      console.log(`  - Seed: ${seedCounts.waiting} 대기, ${seedCounts.active} 실행 중, ${seedCounts.delayed} 지연`);
      console.log(`  - Price Update: ${priceCounts.waiting} 대기, ${priceCounts.active} 실행 중, ${priceCounts.delayed} 지연`);
      console.log(`  - Exchange Rate: ${exchangeCounts.waiting} 대기, ${exchangeCounts.active} 실행 중, ${exchangeCounts.delayed} 지연`);
      console.log(`  - Market Index: ${marketIndexCounts.waiting} 대기, ${marketIndexCounts.active} 실행 중, ${marketIndexCounts.delayed} 지연`);
      console.log(`[Init] 워커 시작 - 큐에 남아있는 작업들이 이어서 실행됩니다.`);
    } else {
      console.log('[Init] 모든 큐가 비어있습니다.');
    }
    
    // 워커 시작 (큐에 남아있는 작업들이 자동으로 처리됨)
    setupPriceUpdateWorker(yahooFinance);
    setupExchangeRateWorker(yahooFinance);
    setupSeedWorker(yahooFinance);
    setupMarketIndexWorker(yahooFinance);
    
    // 서버 시작 시 환율 확인 (6시간 간격)
    await checkExchangeRate();
    
    // 서버 시작 시 시장 지수 확인
    await checkMarketIndices();
  } catch (error) {
    console.warn('[Init] 초기화 중 오류:', error?.message);
    // 에러가 발생해도 워커는 시작
    setupPriceUpdateWorker(yahooFinance);
    setupExchangeRateWorker(yahooFinance);
    setupSeedWorker(yahooFinance);
    setupMarketIndexWorker(yahooFinance);
  }
})();

// 서버 시작 시 환율 확인 (6시간 간격)
async function checkExchangeRate() {
  const cached = await db.get('SELECT * FROM exchange_rates WHERE currency_pair = $1', 'USD/KRW');
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6시간 전
  
  if (!cached || !cached.updated_at || new Date(cached.updated_at) < sixHoursAgo) {
    console.log('[Init] Exchange rate needs update (missing or older than 6 hours), adding to queue...');
    exchangeRateQueue.add({}, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  } else {
    console.log('[Init] Exchange rate is up to date');
  }
}

async function queueMarketIndexUpdate(symbol) {
  try {
    const existingJob = await marketIndexQueue.getJob(symbol);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'failed') {
        await existingJob.remove();
      } else if (state !== 'completed') {
        return { queued: false, state };
      }
    }

    const job = await marketIndexQueue.add(
      { symbol },
      {
        jobId: symbol,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return { queued: true, state: 'waiting', jobId: job.id };
  } catch (error) {
    console.error(`[Market Index Queue] Failed to enqueue ${symbol}:`, error?.message || error);
    return { queued: false, error: error?.message || 'enqueue-failed' };
  }
}

async function checkMarketIndices() {
  try {
    const rows = await db.all('SELECT * FROM index_metrics');
    const rowMap = new Map(rows.map((row) => [row.symbol, row]));
    const now = Date.now();
    const threshold = now - MARKET_INDEX_CACHE_MINUTES * 60 * 1000;

    await Promise.all(
      MARKET_INDICES.map(async (indexInfo) => {
        const row = rowMap.get(indexInfo.symbol);
        if (!row) {
          console.log(`[Init] Market index ${indexInfo.shortLabel} (${indexInfo.symbol}) not cached, enqueue update...`);
          await queueMarketIndexUpdate(indexInfo.symbol);
          return;
        }

        const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        if (!updatedAt || updatedAt < threshold) {
          console.log(`[Init] Market index ${indexInfo.shortLabel} (${indexInfo.symbol}) stale, enqueue update...`);
          await queueMarketIndexUpdate(indexInfo.symbol);
        }
      })
    );
  } catch (error) {
    console.warn('[Init] 시장 지수 확인 중 오류:', error?.message || error);
  }
}

app.use(cors());
app.use(express.json());

function nowIso() {
  return new Date().toISOString();
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// 백그라운드로 가격 업데이트 큐에 추가
function queuePriceUpdates(symbols) {
  symbols.forEach((symbol) => {
    priceUpdateQueue.add({ symbol }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  });
  console.log(`[Queue] Added ${symbols.length} symbols to update queue`);
}

// 환율 업데이트 큐에 추가 (6시간 간격)
function queueExchangeRateUpdate() {
  exchangeRateQueue.add({}, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
  console.log(`[Queue] Added USD/KRW exchange rate to update queue`);
}

// USD 종목이 있는지 확인하고 환율 업데이트 큐에 추가 (6시간 간격)
async function ensureExchangeRate(rows, latestPrices) {
  const hasUsdStocks = rows.some(row => {
    const priceData = latestPrices[row.symbol];
    return priceData?.currency === 'USD' || row.currency === 'USD';
  });
  
  if (hasUsdStocks) {
    const cached = await db.get('SELECT * FROM exchange_rates WHERE currency_pair = $1', 'USD/KRW');
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6시간 전
    
    if (!cached || !cached.updated_at || new Date(cached.updated_at) < sixHoursAgo) {
      queueExchangeRateUpdate();
    }
  }
}

async function getLatestPrices(symbols, forceRefresh = false, context = '') {
  if (!symbols.length) return {};
  
  const result = {};
  const staleSymbols = [];
  const staleDetails = [];
  
  // 가격 캐시 유효 시간 (1시간)
  const PRICE_CACHE_HOURS = 1;
  const cacheThreshold = new Date(Date.now() - PRICE_CACHE_HOURS * 60 * 60 * 1000);
  const now = new Date();
  
  for (const symbol of symbols) {
    const cached = await db.get('SELECT * FROM latest_prices WHERE symbol = $1', symbol);
    
    if (cached && cached.price != null) {
      result[symbol] = {
        price: cached.price,
        name: cached.name,
        exchange: cached.exchange,
        currency: cached.currency,
        updated_at: cached.updated_at || null,
      };
      
      const updatedAt = cached.updated_at ? new Date(cached.updated_at) : null;
      const needsUpdate = forceRefresh || 
                         !updatedAt || 
                         updatedAt < cacheThreshold;
      
      if (needsUpdate) {
        staleSymbols.push(symbol);
        if (updatedAt) {
          const hoursAgo = ((now - updatedAt) / (1000 * 60 * 60)).toFixed(2);
          staleDetails.push({ symbol, hoursAgo, updatedAt: cached.updated_at });
        } else {
          staleDetails.push({ symbol, hoursAgo: 'N/A', updatedAt: null });
        }
      } else if (updatedAt) {
        const hoursAgo = ((now - updatedAt) / (1000 * 60 * 60)).toFixed(2);
        console.log(`[Price Check] ${context}${symbol}: 최신 (${hoursAgo}시간 전 업데이트)`);
      }
    } else {
      staleSymbols.push(symbol);
      result[symbol] = null;
      staleDetails.push({ symbol, hoursAgo: 'N/A', updatedAt: null });
    }
  }
  
  if (staleSymbols.length > 0) {
    console.log(`[Price Update] ${context}${staleSymbols.length}개 종목이 1시간 이상 지났습니다:`);
    staleDetails.forEach(({ symbol, hoursAgo, updatedAt }) => {
      if (updatedAt) {
        console.log(`  - ${symbol}: ${hoursAgo}시간 전 업데이트 (${updatedAt})`);
      } else {
        console.log(`  - ${symbol}: 캐시 없음`);
      }
    });
    console.log(`[Price Update] ${context}큐에 추가: ${staleSymbols.join(', ')}`);
    queuePriceUpdates(staleSymbols);
  } else {
    console.log(`[Price Check] ${context}모든 종목이 최신 상태입니다.`);
  }
  
  return result;
}

async function computePortfolioView(portfolio, items, latestPrices) {
  // USD/KRW 환율 가져오기
  const exchangeRateRow = await db.get('SELECT rate FROM exchange_rates WHERE currency_pair = $1', 'USD/KRW');
  const usdKrwRate = exchangeRateRow?.rate || null;
  
  const hasUsdStocks = items.some(item => {
    const latest = latestPrices[item.symbol] || {};
    const currency = latest.currency || item.currency || 'KRW';
    return currency === 'USD';
  });
  
  if (hasUsdStocks && !usdKrwRate) {
    console.warn('[Portfolio] USD/KRW exchange rate not available - USD stocks will show incorrect values');
  }
  
  const enrichedItems = items.map((item) => {
    const latest = latestPrices[item.symbol] || {};
    const latestPrice = latest.price ?? item.entry_price;
    const currency = latest.currency || item.currency || 'KRW';
    
    let priceInKrw = latestPrice || 0;
    if (currency === 'USD') {
      if (usdKrwRate && usdKrwRate > 0) {
        priceInKrw = (latestPrice || 0) * usdKrwRate;
      } else {
        priceInKrw = latestPrice || 0;
      }
    }
    
    const value = item.current_quantity * priceInKrw;
    return {
      ...item,
      latest_price: latestPrice,
      latest_price_krw: priceInKrw,
      currency: currency,
      current_value: value,
      latest_price_updated_at: latest.updated_at ?? null,
    };
  });

  const currentTotalValue = enrichedItems.reduce((sum, item) => sum + item.current_value, 0);
  const additionalCash = portfolio.additional_cash ?? 0;
  const targetTotalValue = currentTotalValue + additionalCash;

  const finalItems = enrichedItems.map((item) => {
    const currentWeight = currentTotalValue > 0 ? (item.current_value / currentTotalValue) * 100 : 0;
    const diff = currentWeight - item.target_weight;
    const tolerance = item.tolerance ?? 0;
    const min = item.target_weight - tolerance;
    const max = item.target_weight + tolerance;
    const outOfRange = currentWeight < min || currentWeight > max;

    const targetValue = targetTotalValue > 0 ? (targetTotalValue * item.target_weight) / 100 : 0;
    const rebalanceAmount = targetValue - item.current_value;
    const rebalanceQuantity =
      item.latest_price_krw && item.latest_price_krw > 0
        ? rebalanceAmount / item.latest_price_krw
        : 0;

    return {
      ...item,
      current_weight: currentWeight,
      diff,
      tolerance_min: min,
      tolerance_max: max,
      out_of_range: outOfRange,
      rebalance_amount: rebalanceAmount,
      rebalance_quantity: rebalanceQuantity,
    };
  });

  return {
    ...portfolio,
    current_total_value: currentTotalValue,
    target_total_value: targetTotalValue,
    additional_cash: additionalCash,
    items: finalItems,
  };
}

app.get('/api/market-indices', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const nowMs = now.getTime();
    const rows = await db.all('SELECT * FROM index_metrics');
    const rowMap = new Map(rows.map((row) => [row.symbol, row]));
    const staleSymbols = new Set();

    const items = MARKET_INDICES.map((indexInfo) => {
      const row = rowMap.get(indexInfo.symbol);
      const base = {
        slug: indexInfo.slug,
        symbol: indexInfo.symbol,
        label: indexInfo.label,
        shortLabel: indexInfo.shortLabel,
        region: indexInfo.region,
        currentPrice: null,
        high3y: null,
        high3yDate: null,
        percentDrop: null,
        currency: null,
        exchange: null,
        updatedAt: null,
        state: null,
        stateLabel: null,
        isStale: true,
        isUpdating: false,
      };

      if (row) {
        const updatedAt = row.updated_at || null;
        const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
        const isStale = !updatedMs || updatedMs < (nowMs - MARKET_INDEX_CACHE_MINUTES * 60 * 1000);

        base.currentPrice = row.current_price ?? null;
        base.high3y = row.high_3y ?? null;
        base.high3yDate = row.high_3y_date ?? null;
        base.percentDrop =
          typeof row.percent_drop === 'number' && !Number.isNaN(row.percent_drop)
            ? row.percent_drop
            : (row.current_price != null && row.high_3y > 0
                ? ((row.current_price / row.high_3y) - 1) * 100
                : null);
        base.currency = row.currency || null;
        base.exchange = row.exchange || null;
        base.updatedAt = updatedAt;
        base.state = row.state != null ? Number(row.state) : null;
        base.stateLabel = getStateLabel(base.state);
        base.isStale = isStale;

        if (isStale) {
          staleSymbols.add(indexInfo.symbol);
        }
      } else {
        staleSymbols.add(indexInfo.symbol);
      }

      return base;
    });

    if (staleSymbols.size > 0) {
      await Promise.all(Array.from(staleSymbols).map((symbol) => queueMarketIndexUpdate(symbol)));
    }

    const jobStates = await Promise.all(
      MARKET_INDICES.map(async (indexInfo) => {
        const job = await marketIndexQueue.getJob(indexInfo.symbol);
        if (!job) return [indexInfo.symbol, null];
        try {
          const state = await job.getState();
          return [indexInfo.symbol, state];
        } catch (error) {
          console.warn(`[Market Index Queue] Failed to read state for ${indexInfo.symbol}:`, error?.message || error);
          return [indexInfo.symbol, null];
        }
      })
    );

    const jobStateMap = new Map(jobStates);
    const decoratedItems = items.map((item) => {
      const state = jobStateMap.get(item.symbol);
      const isUpdating = state === 'waiting' || state === 'active' || state === 'delayed';
      return {
        ...item,
        isUpdating,
      };
    });

    res.json({
      items: decoratedItems,
      staleSymbols: Array.from(staleSymbols),
      requestedAt: now.toISOString(),
      cacheWindowMinutes: MARKET_INDEX_CACHE_MINUTES,
    });
  } catch (error) {
    console.error('[Market Indices] Failed to load metrics:', error?.message || error);
    res.status(500).json({
      error: 'Failed to fetch market index metrics',
      details: error?.message || 'unknown-error',
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6),
    passwordConfirm: z.string().min(6),
  }).refine((data) => data.password === data.passwordConfirm, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['passwordConfirm'],
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors[0]?.message || 'Invalid payload' });
  }

  const { username, password } = parse.data;
  const existing = await db.get('SELECT id FROM users WHERE email = $1', username);
  if (existing) {
    return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.run(
    'INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
    username, passwordHash, nowIso()
  );

  const token = jwt.sign({ id: result.lastInsertRowid, email: username }, JWT_SECRET, {
    expiresIn: '7d',
  });
  return res.json({ token });
});

app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { username, password } = parse.data;
  const user = await db.get('SELECT * FROM users WHERE email = $1', username);
  if (!user) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });
  return res.json({ token });
});

app.get('/api/me', authMiddleware, (req, res) => {
  return res.json({ id: req.user.id, email: req.user.email });
});

app.get('/api/assets/search', authMiddleware, async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query required' });
  }
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return res.json({ items: [], warning: '검색어를 2글자 이상 입력하세요.' });
  }

  const result = await searchAssets(db, trimmed);
  return res.json(result);
});

app.post('/api/portfolios', authMiddleware, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    isPublic: z.boolean().optional(),
    items: z
      .array(
        z.object({
          symbol: z.string().min(1),
          targetWeight: z.number().positive(),
          quantity: z.number().nonnegative(),
          tolerance: z.number().nonnegative().optional(),
        })
      )
      .min(1),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { name, isPublic = false, items } = parse.data;
  const symbols = [...new Set(items.map((item) => item.symbol.toUpperCase()))];

  try {
    // Verify all symbols exist in assets DB and get prices
    const symbolData = {};
    for (const symbol of symbols) {
      const asset = await db.get('SELECT * FROM assets WHERE symbol = $1', symbol);
      if (!asset) {
        return res.status(400).json({ 
          error: `종목 ${symbol}이(가) DB에 없습니다`,
          details: `${symbol} 종목이 데이터베이스에 등록되어 있지 않습니다. 검색 기능을 통해 등록된 종목만 추가할 수 있습니다.`
        });
      }
      
      const cached = await db.get('SELECT * FROM latest_prices WHERE symbol = $1', symbol);
      if (!cached || !cached.price || cached.price <= 0) {
        return res.status(400).json({ 
          error: `종목 ${symbol}의 가격 정보가 없습니다`,
          details: `${symbol} 종목의 가격이 캐시되어 있지 않습니다. 잠시 후 다시 시도해 주세요.`
        });
      }
      
      symbolData[symbol] = {
        asset,
        price: cached.price,
        name: cached.name,
        exchange: cached.exchange,
        currency: cached.currency,
      };
    }
    
    const portfolioId = await db.transaction(async (tx) => {
      const portfolioResult = await tx.run(
        'INSERT INTO portfolios (user_id, name, initial_invest_amount, is_public, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        req.user.id,
        name,
        0,
        isPublic,
        nowIso()
      );
      const portfolioId = portfolioResult.rows?.[0]?.id || portfolioResult.lastInsertRowid;

      for (const item of items) {
        const symbol = item.symbol.toUpperCase();
        const data = symbolData[symbol];
        const entryPrice = data.price;
        const quantity = item.quantity;
        
        await tx.run(`
          INSERT INTO portfolio_items (
            portfolio_id, asset_id, target_weight, tolerance, entry_price,
            initial_quantity, current_quantity, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          portfolioId,
          data.asset.id,
          item.targetWeight,
          item.tolerance ?? 0,
          entryPrice,
          quantity,
          quantity,
          nowIso()
        );
      }

      return portfolioId;
    });

    const portfolio = await db.get('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', portfolioId, req.user.id);
    const rows = await db.all(
      `
        SELECT portfolio_items.*, assets.symbol, assets.name, assets.name_ko, assets.exchange, assets.currency
        FROM portfolio_items
        JOIN assets ON portfolio_items.asset_id = assets.id
        WHERE portfolio_items.portfolio_id = $1
        ORDER BY portfolio_items.id ASC
      `,
      portfolioId
    );

    // Get latest prices for view
    const latest = {};
    symbols.forEach((symbol) => {
      const data = symbolData[symbol];
      latest[symbol] = {
        price: data.price,
        name: data.name,
        exchange: data.exchange,
        currency: data.currency,
      };
    });

    await ensureExchangeRate(rows, latest);
    const view = await computePortfolioView(portfolio, rows, latest);
    return res.status(201).json(view);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Create failed' });
  }
});

app.get('/api/portfolios', authMiddleware, async (req, res) => {
  const portfolios = await db.all('SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC', req.user.id);
  if (!portfolios.length) {
    return res.json({ items: [] });
  }
  const portfolioIds = portfolios.map((p) => p.id);
  const placeholders = portfolioIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await db.all(
      `
      SELECT portfolio_items.*, assets.symbol, assets.name, assets.exchange, assets.currency
      FROM portfolio_items
      JOIN assets ON portfolio_items.asset_id = assets.id
      WHERE portfolio_items.portfolio_id IN (${placeholders})
      ORDER BY portfolio_items.id ASC
    `,
    ...portfolioIds
  );

  // 목록에서는 가격 업데이트를 하지 않음 (캐시된 가격만 사용)
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const latest = {};
  
  // 캐시된 가격만 조회 (큐에 넣지 않음)
  for (const symbol of symbols) {
    const cached = await db.get('SELECT * FROM latest_prices WHERE symbol = $1', symbol);
    
    if (cached && cached.price != null) {
      latest[symbol] = {
        price: cached.price,
        name: cached.name,
        exchange: cached.exchange,
        currency: cached.currency,
        updated_at: cached.updated_at || null,
      };
    }
  }
  
  // USD 종목이 있으면 환율 확인 (환율도 캐시된 것만 사용)
  if (rows.length > 0) {
    await ensureExchangeRate(rows, latest);
  }

  const grouped = await Promise.all(portfolios.map(async (portfolio) => {
    const items = rows.filter((row) => row.portfolio_id === portfolio.id);
    return await computePortfolioView(portfolio, items, latest);
  }));

  return res.json({ items: grouped });
});

// 공개 포트폴리오 조회 (인증 불필요) - :id 라우트보다 먼저 정의해야 함
app.get('/api/portfolios/public', async (req, res) => {
  const limit = parseInt(req.query.limit) || 6;
  
  // 공개 포트폴리오 랜덤 조회 (종목 3개 이상인 포트폴리오만)
  const portfolios = await db.all(`
      SELECT portfolios.*, users.email
      FROM portfolios
      JOIN users ON portfolios.user_id = users.id
      WHERE portfolios.is_public = TRUE
        AND (
          SELECT COUNT(*)
          FROM portfolio_items
          WHERE portfolio_items.portfolio_id = portfolios.id
        ) >= 3
      ORDER BY RANDOM()
      LIMIT $1
    `, limit);

  if (!portfolios.length) {
    return res.json({ items: [] });
  }

  const portfolioIds = portfolios.map((p) => p.id);
  const placeholders = portfolioIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await db.all(
      `
      SELECT portfolio_items.*, assets.symbol, assets.name, assets.name_ko, assets.exchange, assets.currency
      FROM portfolio_items
      JOIN assets ON portfolio_items.asset_id = assets.id
      WHERE portfolio_items.portfolio_id IN (${placeholders})
      ORDER BY portfolio_items.id ASC
    `,
    ...portfolioIds
  );

  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const latest = {};
  
  // 캐시된 가격만 조회
  for (const symbol of symbols) {
    const cached = await db.get('SELECT * FROM latest_prices WHERE symbol = $1', symbol);
    
    if (cached && cached.price != null) {
      latest[symbol] = {
        price: cached.price,
        name: cached.name,
        exchange: cached.exchange,
        currency: cached.currency,
        updated_at: cached.updated_at || null,
      };
    }
  }

  const grouped = await Promise.all(portfolios.map(async (portfolio) => {
    const items = rows.filter((row) => row.portfolio_id === portfolio.id);
    const view = await computePortfolioView(portfolio, items, latest);
    return {
      ...view,
      owner_email: portfolio.email,
    };
  }));

  return res.json({ items: grouped });
});

app.get('/api/portfolios/:id', authMiddleware, async (req, res) => {
  const portfolio = await db.get('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', req.params.id, req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Not found' });
  }
  const rows = await db.all(
      `
      SELECT portfolio_items.*, assets.symbol, assets.name, assets.name_ko, assets.exchange, assets.currency
      FROM portfolio_items
      JOIN assets ON portfolio_items.asset_id = assets.id
      WHERE portfolio_items.portfolio_id = $1
      ORDER BY portfolio_items.id ASC
    `,
    portfolio.id
  );
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  
  // 상세 페이지에서만 가격 업데이트 체크 및 큐에 추가
  console.log(`[Portfolio Detail] 포트폴리오 #${portfolio.id} "${portfolio.name}" 접속 - ${symbols.length}개 종목 확인 중...`);
  const latest = await getLatestPrices(symbols, false, `[포트폴리오 #${portfolio.id}] `);
  
  // USD 종목이 있으면 환율 확인
  if (rows.length > 0) {
    await ensureExchangeRate(rows, latest);
  }
  
  const view = await computePortfolioView(portfolio, rows, latest);
  return res.json(view);
});

app.put('/api/portfolios/:id', authMiddleware, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    memo: z.string().optional(),
    additionalCash: z.number().optional(),
    isPublic: z.boolean().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const portfolio = await db.get('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', req.params.id, req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (parse.data.name !== undefined) {
    await db.run('UPDATE portfolios SET name = $1 WHERE id = $2', parse.data.name, req.params.id);
  }

  if (parse.data.memo !== undefined) {
    await db.run('UPDATE portfolios SET memo = $1 WHERE id = $2', parse.data.memo || null, req.params.id);
  }

  if (parse.data.additionalCash !== undefined) {
    await db.run('UPDATE portfolios SET additional_cash = $1 WHERE id = $2', parse.data.additionalCash, req.params.id);
  }

  if (parse.data.isPublic !== undefined) {
    await db.run('UPDATE portfolios SET is_public = $1 WHERE id = $2', parse.data.isPublic, req.params.id);
  }

  return res.json({ ok: true });
});

app.delete('/api/portfolios/:id', authMiddleware, async (req, res) => {
  const portfolio = await db.get('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', req.params.id, req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Not found' });
  }

  // 포트폴리오 아이템 삭제
  await db.run('DELETE FROM portfolio_items WHERE portfolio_id = $1', req.params.id);
  
  // 포트폴리오 삭제
  await db.run('DELETE FROM portfolios WHERE id = $1', req.params.id);

  return res.json({ ok: true });
});

app.post('/api/portfolios/:id/refresh', authMiddleware, async (req, res) => {
  const portfolio = await db.get('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', req.params.id, req.user.id);
  if (!portfolio) {
    return res.status(404).json({ error: 'Not found' });
  }
  const rows = await db.all(
      `
      SELECT portfolio_items.*, assets.symbol, assets.name, assets.name_ko, assets.exchange, assets.currency
      FROM portfolio_items
      JOIN assets ON portfolio_items.asset_id = assets.id
      WHERE portfolio_items.portfolio_id = $1
      ORDER BY portfolio_items.id ASC
    `,
    portfolio.id
  );
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const latest = await getLatestPrices(symbols, true); // Force refresh
  
  await ensureExchangeRate(rows, latest);
  const view = await computePortfolioView(portfolio, rows, latest);
  return res.json(view);
});

app.put('/api/portfolio-items/:id', authMiddleware, async (req, res) => {
  const schema = z.object({
    currentQuantity: z.number().nonnegative().optional(),
    tolerance: z.number().nonnegative().optional(),
    targetWeight: z.number().nonnegative().optional(),
    nickname: z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const item = await db.get(
      `
      SELECT portfolio_items.*, portfolios.user_id
      FROM portfolio_items
      JOIN portfolios ON portfolio_items.portfolio_id = portfolios.id
      WHERE portfolio_items.id = $1
    `,
    req.params.id
  );

  if (!item || item.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Not found' });
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;
  
  if (parse.data.currentQuantity !== undefined) {
    updates.push(`current_quantity = $${paramIndex++}`);
    values.push(parse.data.currentQuantity);
  }
  if (parse.data.tolerance !== undefined) {
    updates.push(`tolerance = $${paramIndex++}`);
    values.push(parse.data.tolerance);
  }
  if (parse.data.targetWeight !== undefined) {
    updates.push(`target_weight = $${paramIndex++}`);
    values.push(parse.data.targetWeight);
  }
  if (parse.data.nickname !== undefined) {
    updates.push(`nickname = $${paramIndex++}`);
    values.push(parse.data.nickname || null);
  }
  if (!updates.length) {
    return res.status(400).json({ error: 'No updates provided' });
  }

  values.push(req.params.id);
  await db.run(`UPDATE portfolio_items SET ${updates.join(', ')} WHERE id = $${paramIndex}`, ...values);

  return res.json({ ok: true });
});

app.post('/api/portfolios/:id/items', authMiddleware, async (req, res) => {
  const schema = z.object({
    symbol: z.string().min(1, '종목 심볼이 필요합니다'),
    targetWeight: z.number().positive('목표 비중은 0보다 큰 양수여야 합니다'),
    quantity: z.number().nonnegative('수량은 0 이상이어야 합니다'),
    tolerance: z.number().nonnegative().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ 
      error: 'Invalid payload',
      details: parse.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    });
  }

  const portfolio = await db.get('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', req.params.id, req.user.id);
  if (!portfolio) return res.status(404).json({ error: 'Not found' });

  const symbol = parse.data.symbol.toUpperCase();
  try {
    let asset = await db.get('SELECT * FROM assets WHERE symbol = $1', symbol);
    
    if (!asset) {
      return res.status(400).json({ 
        error: `종목이 DB에 없습니다`,
        details: `${symbol} 종목이 데이터베이스에 등록되어 있지 않습니다. 검색 기능을 통해 등록된 종목만 추가할 수 있습니다.`
      });
    }
    
    const cached = await db.get('SELECT * FROM latest_prices WHERE symbol = $1', symbol);
    
    let entryPrice = null;
    if (cached && cached.price != null) {
      entryPrice = cached.price;
      if (!cached.updated_at) {
        queuePriceUpdates([symbol]);
      }
    } else {
      queuePriceUpdates([symbol]);
      return res.status(400).json({ 
        error: `가격 정보가 없습니다`,
        details: `${symbol} 종목의 가격이 아직 조회되지 않았습니다. 백그라운드에서 조회 중입니다. 잠시 후 다시 시도해 주세요.`
      });
    }
    
    if (!entryPrice || entryPrice <= 0) {
      return res.status(400).json({ 
        error: `가격 정보를 가져올 수 없습니다`,
        details: `${symbol} 종목의 가격을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.`
      });
    }

    await db.run(`
      INSERT INTO portfolio_items (
        portfolio_id, asset_id, target_weight, tolerance, entry_price,
        initial_quantity, current_quantity, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      portfolio.id,
      asset.id,
      parse.data.targetWeight,
      parse.data.tolerance ?? 0,
      entryPrice,
      parse.data.quantity,
      parse.data.quantity,
      nowIso()
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Add item failed' });
  }
});

app.delete('/api/portfolio-items/:id', authMiddleware, async (req, res) => {
  const item = await db.get(
      `
      SELECT portfolio_items.*, portfolios.user_id
      FROM portfolio_items
      JOIN portfolios ON portfolio_items.portfolio_id = portfolios.id
      WHERE portfolio_items.id = $1
    `,
    req.params.id
  );

  if (!item || item.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Not found' });
  }

  await db.run('DELETE FROM portfolio_items WHERE id = $1', req.params.id);
  return res.json({ ok: true });
});

// 종목 코드를 큐에 추가하는 API
app.post('/api/queue/add-symbol', authMiddleware, async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: '종목 코드를 입력해주세요.' });
    }
    
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) {
      return res.status(400).json({ error: '종목 코드를 입력해주세요.' });
    }
    
    // 이미 .KS 또는 .KQ가 포함되어 있는지 확인
    const hasSuffix = trimmed.includes('.KS') || trimmed.includes('.KQ');
    let code = trimmed;
    let yahoo_suffix = null;
    let name_ko = null;
    let market = null;
    
    if (hasSuffix) {
      // 이미 suffix가 있는 경우 (예: 005930.KS, 005930.KQ)
      const parts = trimmed.split('.');
      code = parts[0];
      yahoo_suffix = parts[1];
      
      // 6자리 숫자인지 확인
      if (/^\d{6}$/.test(code)) {
        // krx_listings에서 정보 확인
        const listing = await db.get('SELECT code, name_ko, market, yahoo_suffix FROM krx_listings WHERE code = $1', code.padStart(6, '0'));
        if (listing) {
          name_ko = listing.name_ko;
          market = listing.market;
          yahoo_suffix = listing.yahoo_suffix || yahoo_suffix;
        }
      }
    } else if (/^\d{6}$/.test(trimmed)) {
      // 6자리 숫자면 한국 주식으로 처리
      code = trimmed.padStart(6, '0');
      const listing = await db.get('SELECT code, name_ko, market, yahoo_suffix FROM krx_listings WHERE code = $1', code);
      if (listing) {
        name_ko = listing.name_ko;
        market = listing.market;
        yahoo_suffix = listing.yahoo_suffix || 'KS'; // 기본값 KS
      } else {
        // krx_listings에 없으면 기본값으로 처리
        yahoo_suffix = 'KS';
      }
    } else {
      // 그 외는 미국 주식으로 처리
      code = trimmed;
      yahoo_suffix = null;
    }
    
    // seedQueue에 작업 추가
    const job = await seedQueue.add(
      {
        code,
        name_ko,
        market,
        yahoo_suffix,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    
    console.log(`[Add Symbol] Added to queue: ${code}${yahoo_suffix ? '.' + yahoo_suffix : ''} (${name_ko || code})`);
    
    return res.json({
      ok: true,
      message: '종목이 큐에 추가되었습니다.',
      jobId: job.id,
      symbol: yahoo_suffix ? `${code}.${yahoo_suffix}` : code,
      name_ko: name_ko || null,
    });
  } catch (error) {
    console.error('[Add Symbol] Error:', error);
    return res.status(500).json({ error: '종목 추가 중 오류가 발생했습니다.', details: error.message });
  }
});

// 큐 상태 확인 API
app.get('/api/queue/status', authMiddleware, async (req, res) => {
  try {
    const [priceWaiting, priceActive, priceCompleted, priceFailed] = await Promise.all([
      priceUpdateQueue.getWaiting().catch(() => []),
      priceUpdateQueue.getActive().catch(() => []),
      priceUpdateQueue.getCompleted(0, 10).catch(() => []),
      priceUpdateQueue.getFailed(0, 10).catch(() => []),
    ]);

    const [seedWaiting, seedActive, seedCompleted, seedFailed] = await Promise.all([
      seedQueue.getWaiting().catch(() => []),
      seedQueue.getActive().catch(() => []),
      seedQueue.getCompleted(0, 10).catch(() => []),
      seedQueue.getFailed(0, 10).catch(() => []),
    ]);

    const [exchangeWaiting, exchangeActive, exchangeCompleted, exchangeFailed] = await Promise.all([
      exchangeRateQueue.getWaiting().catch(() => []),
      exchangeRateQueue.getActive().catch(() => []),
      exchangeRateQueue.getCompleted(0, 10).catch(() => []),
      exchangeRateQueue.getFailed(0, 10).catch(() => []),
    ]);

    const [marketIndexWaiting, marketIndexActive, marketIndexCompleted, marketIndexFailed] = await Promise.all([
      marketIndexQueue.getWaiting().catch(() => []),
      marketIndexQueue.getActive().catch(() => []),
      marketIndexQueue.getCompleted(0, 10).catch(() => []),
      marketIndexQueue.getFailed(0, 10).catch(() => []),
    ]);

    const [priceCounts, seedCounts, exchangeCounts, marketIndexCounts] = await Promise.all([
      priceUpdateQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
      seedQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
      exchangeRateQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
      marketIndexQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
    ]);

    return res.json({
      priceUpdate: {
        counts: priceCounts,
        waiting: priceWaiting.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || 'N/A',
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        active: priceActive.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || 'N/A',
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        recentCompleted: priceCompleted.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || job.data?.code || 'N/A',
          completed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
        })),
        recentFailed: priceFailed.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || job.data?.code || 'N/A',
          failed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
          error: job.failedReason || 'Unknown error',
        })),
      },
      seed: {
        counts: seedCounts,
        waiting: seedWaiting.map(job => ({
          id: job.id,
          code: job.data?.code || 'N/A',
          name_ko: job.data?.name_ko || null,
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        active: seedActive.map(job => ({
          id: job.id,
          code: job.data?.code || 'N/A',
          name_ko: job.data?.name_ko || null,
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        recentCompleted: seedCompleted.map(job => ({
          id: job.id,
          code: job.data?.code || 'N/A',
          name_ko: job.data?.name_ko || null,
          completed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
        })),
        recentFailed: seedFailed.map(job => ({
          id: job.id,
          code: job.data?.code || 'N/A',
          name_ko: job.data?.name_ko || null,
          failed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
          error: job.failedReason || 'Unknown error',
        })),
      },
      exchangeRate: {
        counts: exchangeCounts,
        waiting: exchangeWaiting.map(job => ({
          id: job.id,
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        active: exchangeActive.map(job => ({
          id: job.id,
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        recentCompleted: exchangeCompleted.map(job => ({
          id: job.id,
          completed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
        })),
        recentFailed: exchangeFailed.map(job => ({
          id: job.id,
          failed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
          error: job.failedReason || 'Unknown error',
        })),
      },
      marketIndex: {
        counts: marketIndexCounts,
        waiting: marketIndexWaiting.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || 'N/A',
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        active: marketIndexActive.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || 'N/A',
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
        })),
        recentCompleted: marketIndexCompleted.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || 'N/A',
          completed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
        })),
        recentFailed: marketIndexFailed.map(job => ({
          id: job.id,
          symbol: job.data?.symbol || 'N/A',
          failed: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date(job.timestamp).toISOString(),
          error: job.failedReason || 'Unknown error',
        })),
      },
    });
  } catch (error) {
    console.error('[Queue Status] Error:', error);
    return res.status(500).json({ error: 'Failed to get queue status', details: error.message });
  }
});

// 클라이언트 정적 파일 서빙 (프로덕션 환경) - API 라우트 이후에 배치
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  
  // 가능한 경로들 시도 (Nixpacks는 루트에서 빌드하고 server 디렉토리에서 실행)
  const possiblePaths = [
    path.join(__dirname, '../client/dist'),  // Nixpacks: /app/server -> /app/client/dist
    path.join(__dirname, 'client/dist'),      // Docker: /app -> /app/client/dist
    path.join(process.cwd(), 'client/dist'), // 현재 작업 디렉토리 기준
  ];
  
  let clientDistPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      clientDistPath = testPath;
      console.log(`[Static] 클라이언트 파일 경로 발견: ${clientDistPath}`);
      break;
    }
  }
  
  if (!clientDistPath) {
    console.error('[Static] ❌ 클라이언트 빌드 디렉토리를 찾을 수 없습니다.');
    console.error(`[Static] 현재 디렉토리: ${__dirname}`);
    console.error(`[Static] 작업 디렉토리: ${process.cwd()}`);
    console.error('[Static] 시도한 경로들:');
    possiblePaths.forEach(p => {
      const absPath = path.resolve(p);
      console.error(`  - ${p} -> ${absPath} (존재: ${fs.existsSync(absPath)})`);
    });
    console.error('[Static] 빌드가 완료되었는지 확인하세요.');
  } else {
    // 절대 경로로 변환
    const absoluteClientDistPath = path.resolve(clientDistPath);
    const indexPath = path.join(absoluteClientDistPath, 'index.html');
    
    console.log(`[Static] ✅ 클라이언트 파일 서빙: ${absoluteClientDistPath}`);
    console.log(`[Static] ✅ index.html 경로: ${indexPath}`);
    console.log(`[Static] ✅ index.html 존재: ${fs.existsSync(indexPath)}`);
    
    app.use(express.static(absoluteClientDistPath));
    
    // API가 아닌 모든 요청은 클라이언트로 라우팅 (SPA 라우팅 지원)
    app.use((req, res, next) => {
      // API 경로는 제외
      if (req.path.startsWith('/api/')) {
        return next();
      }
      // sendFile은 절대 경로 필요
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[Static] 파일 전송 오류: ${err.message}`);
          console.error(`[Static] 시도한 경로: ${indexPath}`);
          console.error(`[Static] 파일 존재 여부: ${fs.existsSync(indexPath)}`);
          res.status(404).send('Not Found');
        }
      });
    });
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
