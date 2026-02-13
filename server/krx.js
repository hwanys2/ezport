const { db } = require('./db');

function nowIso() {
  return new Date().toISOString();
}

function normalizeKo(s) {
  return String(s || '').trim();
}

function marketToSuffix(market) {
  const v = String(market || '').toUpperCase();
  if (v.includes('KOSDAQ') || v.includes('코스닥')) return 'KQ';
  if (v.includes('KOSPI') || v.includes('코스피')) return 'KS';
  if (v.includes('KONEX') || v.includes('코넥스')) return 'KS';
  return 'KS';
}

async function upsertListings(listings) {
  await db.transaction(async (tx) => {
    const ts = nowIso();
    for (const row of listings) {
      const code = String(row.code || '').padStart(6, '0');
      const name = normalizeKo(row.name_ko);
      if (!code || !name) continue;
      const market = row.market || null;
      const suffix = row.yahoo_suffix || marketToSuffix(market);
      await tx.run(
        `INSERT INTO krx_listings (code, name_ko, market, yahoo_suffix, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(code) DO UPDATE SET
           name_ko=excluded.name_ko,
           market=excluded.market,
           yahoo_suffix=excluded.yahoo_suffix,
           updated_at=excluded.updated_at`,
        code, name, market, suffix, ts
      );
    }
  });
}

async function searchByNameKo(q, limit = 8) {
  const query = normalizeKo(q);
  if (!query) return [];
  const like = `%${query}%`;
  return await db.all(
    `SELECT code, name_ko, market, yahoo_suffix
     FROM krx_listings
     WHERE name_ko LIKE $1
     ORDER BY CASE
       WHEN name_ko = $2 THEN 0
       WHEN name_ko LIKE $3 THEN 1
       ELSE 2
     END, LENGTH(name_ko) ASC
     LIMIT $4`,
    like, query, `${query}%`, limit
  );
}

async function searchByAny(q, limit = 8) {
  const query = normalizeKo(q);
  if (!query) return [];
  
  // Try exact code match first
  const exactCode = await db.get(
    'SELECT code, name_ko, market, yahoo_suffix FROM krx_listings WHERE code = $1',
    query.padStart(6, '0')
  );
  if (exactCode) return [exactCode];
  
  // Try partial name match (Korean or romanized)
  const like = `%${query}%`;
  const upperLike = `%${query.toUpperCase()}%`;
  return await db.all(
    `SELECT code, name_ko, market, yahoo_suffix
     FROM krx_listings
     WHERE name_ko LIKE $1 OR UPPER(name_ko) LIKE $2
     ORDER BY CASE
       WHEN name_ko = $3 THEN 0
       WHEN UPPER(name_ko) = $4 THEN 1
       WHEN name_ko LIKE $5 THEN 2
       WHEN UPPER(name_ko) LIKE $6 THEN 3
       ELSE 4
     END, LENGTH(name_ko) ASC
     LIMIT $7`,
    like, upperLike, query, query.toUpperCase(), `${query}%`, `${query.toUpperCase()}%`, limit
  );
}

async function hasAnyListings() {
  const row = await db.get('SELECT COUNT(1) AS cnt FROM krx_listings');
  return (row?.cnt || 0) > 0;
}

async function getAllListings(limit = null) {
  if (limit) {
    return await db.all('SELECT code, name_ko, market, yahoo_suffix FROM krx_listings ORDER BY code ASC LIMIT $1', limit);
  }
  return await db.all('SELECT code, name_ko, market, yahoo_suffix FROM krx_listings ORDER BY code ASC');
}

module.exports = {
  upsertListings,
  searchByNameKo,
  searchByAny,
  hasAnyListings,
  getAllListings,
};

