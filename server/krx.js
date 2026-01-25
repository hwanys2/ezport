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

function upsertListings(listings) {
  const stmt = db.prepare(
    `INSERT INTO krx_listings (code, name_ko, market, yahoo_suffix, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name_ko=excluded.name_ko,
       market=excluded.market,
       yahoo_suffix=excluded.yahoo_suffix,
       updated_at=excluded.updated_at`
  );
  const tx = db.transaction(() => {
    const ts = nowIso();
    listings.forEach((row) => {
      const code = String(row.code || '').padStart(6, '0');
      const name = normalizeKo(row.name_ko);
      if (!code || !name) return;
      const market = row.market || null;
      const suffix = row.yahoo_suffix || marketToSuffix(market);
      stmt.run(code, name, market, suffix, ts);
    });
  });
  tx();
}

function searchByNameKo(q, limit = 8) {
  const query = normalizeKo(q);
  if (!query) return [];
  const like = `%${query}%`;
  return db
    .prepare(
      `SELECT code, name_ko, market, yahoo_suffix
       FROM krx_listings
       WHERE name_ko LIKE ?
       ORDER BY CASE
         WHEN name_ko = ? THEN 0
         WHEN name_ko LIKE ? THEN 1
         ELSE 2
       END, LENGTH(name_ko) ASC
       LIMIT ?`
    )
    .all(like, query, `${query}%`, limit);
}

function searchByAny(q, limit = 8) {
  const query = normalizeKo(q);
  if (!query) return [];
  
  // Try exact code match first
  const exactCode = db
    .prepare('SELECT code, name_ko, market, yahoo_suffix FROM krx_listings WHERE code = ?')
    .get(query.padStart(6, '0'));
  if (exactCode) return [exactCode];
  
  // Try partial name match (Korean or romanized)
  const like = `%${query}%`;
  const upperLike = `%${query.toUpperCase()}%`;
  return db
    .prepare(
      `SELECT code, name_ko, market, yahoo_suffix
       FROM krx_listings
       WHERE name_ko LIKE ? OR UPPER(name_ko) LIKE ?
       ORDER BY CASE
         WHEN name_ko = ? THEN 0
         WHEN UPPER(name_ko) = ? THEN 1
         WHEN name_ko LIKE ? THEN 2
         WHEN UPPER(name_ko) LIKE ? THEN 3
         ELSE 4
       END, LENGTH(name_ko) ASC
       LIMIT ?`
    )
    .all(like, upperLike, query, query.toUpperCase(), `${query}%`, `${query.toUpperCase()}%`, limit);
}

function hasAnyListings() {
  const row = db.prepare('SELECT COUNT(1) AS cnt FROM krx_listings').get();
  return (row?.cnt || 0) > 0;
}

function getAllListings(limit = null) {
  let query = 'SELECT code, name_ko, market, yahoo_suffix FROM krx_listings ORDER BY code ASC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  return db.prepare(query).all();
}

module.exports = {
  upsertListings,
  searchByNameKo,
  searchByAny,
  hasAnyListings,
  getAllListings,
};

