const { searchByAny, hasAnyListings } = require('./krx');

function uniqBySymbol(items) {
  const map = new Map();
  items.forEach((item) => {
    if (item?.symbol && !map.has(item.symbol)) map.set(item.symbol, item);
  });
  return [...map.values()];
}

async function ensureExactTickerFirst(db, trimmed, items) {
  const q = (trimmed || '').trim().toUpperCase();
  if (!q) return items;
  const exact = await db.get(
    'SELECT symbol, name, name_ko, exchange, currency FROM assets WHERE UPPER(TRIM(symbol)) = $1',
    q
  );
  if (!exact) return items;
  const exactItem = {
    symbol: exact.symbol,
    name: exact.name || exact.symbol,
    name_ko: exact.name_ko || null,
    exchange: exact.exchange || '',
    currency: exact.currency || '',
  };
  const rest = items.filter(
    (r) => (r.symbol || '').toUpperCase().trim() !== q
  );
  return [exactItem, ...rest];
}

async function searchAssets(db, trimmed) {
  // 검색은 항상 최신 데이터를 보여줘야 하므로 캐시 사용 안 함

  const results = [];
  const like = `%${trimmed}%`; // LIKE 패턴 (함수 전체에서 사용)

  // STEP 2: Search KRX listings (한글 이름, 코드)
  if (await hasAnyListings()) {
    const krxCandidates = await searchByAny(trimmed, 15);
    krxCandidates.forEach((candidate) => {
      const symbol = `${candidate.code}.${(candidate.yahoo_suffix || 'KS').toUpperCase()}`;
      results.push({
        symbol,
        name: null, // KRX는 영문 이름이 없을 수 있음
        name_ko: candidate.name_ko,
        exchange: candidate.market || 'KRX',
        currency: 'KRW',
      });
    });
  }

  // STEP 3: Search US stock listings (미국 주식 목록)
  try {
    const upperTrimmed = trimmed.toUpperCase();
    const upperLike = `%${upperTrimmed}%`;
    const usStockResults = await db.all(
      `
        SELECT symbol, name, exchange, NULL as name_ko, NULL as currency
        FROM us_stock_listings
        WHERE UPPER(symbol) LIKE $1 OR UPPER(name) LIKE $2
        ORDER BY 
          CASE
            WHEN UPPER(symbol) = $3 THEN 0
            WHEN UPPER(name) = $4 THEN 1
            WHEN UPPER(symbol) LIKE $5 THEN 2
            WHEN UPPER(name) LIKE $6 THEN 3
            ELSE 4
          END,
          LENGTH(symbol) ASC
        LIMIT 10
      `,
      upperLike, upperLike,
      upperTrimmed, upperTrimmed,
      `${upperTrimmed}%`, `${upperTrimmed}%`
    );
    
    usStockResults.forEach((stock) => {
      results.push({
        symbol: stock.symbol,
        name: stock.name,
        name_ko: null,
        exchange: stock.exchange || 'US',
        currency: 'USD',
      });
    });
  } catch (error) {
    // us_stock_listings 테이블이 없으면 무시 (아직 업데이트 안 함)
    if (!error.message.includes('no such table') && !error.message.includes('does not exist')) {
      console.error('[Search] US stock search error:', error?.message);
    }
  }

  // STEP 4: Search assets table (영문 이름, 한글 이름, 심볼)
  // 대소문자 구분 없이 검색
  const upperTrimmed = trimmed.toUpperCase();
  const upperLike = `%${upperTrimmed}%`;
  
  console.log(`[Search] Searching assets table for: "${trimmed}" (upper: "${upperTrimmed}")`);
  
  // 먼저 정확한 심볼 매칭 확인
  const exactSymbol = await db.get(
    'SELECT symbol, name, name_ko, exchange, currency FROM assets WHERE symbol = $1',
    upperTrimmed
  );
  
  if (exactSymbol) {
    console.log(`[Search] ✓ Found exact symbol match: ${exactSymbol.symbol} (${exactSymbol.name || 'N/A'})`);
    results.push({
      symbol: exactSymbol.symbol,
      name: exactSymbol.name || exactSymbol.symbol,
      name_ko: exactSymbol.name_ko || null,
      exchange: exactSymbol.exchange || '',
      currency: exactSymbol.currency || '',
    });
  }
  
  // 부분 매칭 검색 (정확한 매칭이 없거나 추가 결과가 필요한 경우)
  const assetsResults = await db.all(
    `
      SELECT symbol, name, name_ko, exchange, currency
      FROM assets
      WHERE symbol != $1
        AND (
          UPPER(symbol) LIKE $2
          OR (name IS NOT NULL AND UPPER(name) LIKE $3)
          OR (name_ko IS NOT NULL AND name_ko LIKE $4)
        )
      ORDER BY 
        CASE
          WHEN UPPER(symbol) LIKE $5 THEN 0
          WHEN name IS NOT NULL AND UPPER(name) LIKE $6 THEN 1
          WHEN name_ko IS NOT NULL AND name_ko LIKE $7 THEN 2
          ELSE 3
        END,
        LENGTH(symbol) ASC
      LIMIT 19
    `,
    upperTrimmed, upperLike, upperLike, like,
    `${upperTrimmed}%`, `${upperTrimmed}%`, `${trimmed}%`
  );
  
  console.log(`[Search] assets table partial search for "${trimmed}": found ${assetsResults.length} results`);
  if (assetsResults.length > 0) {
    console.log(`[Search] Sample results:`, assetsResults.slice(0, 5).map(r => `${r.symbol} (${r.name || 'N/A'})`));
  }
  
  assetsResults.forEach((asset) => {
    // 중복 제거 (정확한 매칭과 겹치지 않도록)
    if (!results.some(r => r.symbol === asset.symbol)) {
      results.push({
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        name_ko: asset.name_ko || null,
        exchange: asset.exchange || '',
        currency: asset.currency || '',
      });
    }
  });


  // Deduplicate by symbol
  const uniqueResults = uniqBySymbol(results);

  // 티커(심볼) 검색 결과 우선: 정확 일치 → 심볼 접두사 → 심볼 포함 → 이름만
  const q = trimmed.toUpperCase();
  uniqueResults.sort((a, b) => {
    const symA = (a.symbol || '').toUpperCase();
    const symB = (b.symbol || '').toUpperCase();
    const priority = (sym) => {
      if (sym === q) return 0;
      if (sym.startsWith(q)) return 1;
      if (sym.includes(q)) return 2;
      return 3;
    };
    return priority(symA) - priority(symB);
  });

  const withExactFirst = await ensureExactTickerFirst(db, trimmed, uniqueResults);

  const response = {
    items: withExactFirst.slice(0, 20),
  };

  console.log(`[Search] Found ${uniqueResults.length} results for "${trimmed}"`);
  // 검색은 항상 최신 데이터를 보여줘야 하므로 캐시 저장 안 함
  return response;
}

async function saveSearchCache(db, cacheKey, response) {
  try {
    await db.run(
      'INSERT INTO search_cache (query, results, updated_at) VALUES ($1, $2, $3) ON CONFLICT (query) DO UPDATE SET results = excluded.results, updated_at = excluded.updated_at',
      cacheKey, JSON.stringify(response), new Date().toISOString()
    );
  } catch (e) {
    console.error('[Cache] Save failed:', e.message);
  }
}

module.exports = { searchAssets };
