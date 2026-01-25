/* eslint-disable no-console */
const iconv = require('iconv-lite');
const { initDb } = require('../db');
const { upsertListings } = require('../krx');

// KIND (KRX) listed companies download.
// NOTE: This is an XLS file and may change columns over time.
const KIND_XLS_URL =
  'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13';

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtmlTable(html) {
  const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = rowMatches.map((rowHtml) => {
    const cellMatches = rowHtml.match(/<(td|th)[^>]*>[\s\S]*?<\/(td|th)>/gi) || [];
    return cellMatches.map((cellHtml) => stripTags(cellHtml));
  });
  return rows.filter((r) => r.length > 0);
}

function findIndex(headers, candidates) {
  const lower = headers.map((h) => String(h || '').toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(String(c).toLowerCase());
    if (idx >= 0) return idx;
  }
  // partial match fallback
  for (let i = 0; i < lower.length; i++) {
    if (candidates.some((c) => lower[i].includes(String(c).toLowerCase()))) return i;
  }
  return -1;
}

async function main() {
  initDb();

  console.log('[krx:update] downloading:', KIND_XLS_URL);
  const res = await fetch(KIND_XLS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
    },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // KIND returns an HTML table with EUC-KR encoding but "excel" content-type.
  const html = iconv.decode(buf, 'euc-kr');
  const table = parseHtmlTable(html);
  if (table.length < 2) {
    throw new Error('Parsed 0 rows (KIND format may have changed)');
  }
  const headers = table[0];
  const idxCode = findIndex(headers, ['종목코드', '종목 코드', 'code']);
  const idxName = findIndex(headers, ['회사명', '회사 명', 'name']);
  const idxMarket = findIndex(headers, ['시장구분', '시장 구분', 'market']);

  const listings = table
    .slice(1)
    .map((row) => ({
      code: row[idxCode] || '',
      name_ko: row[idxName] || '',
      market: idxMarket >= 0 ? row[idxMarket] || '' : '',
    }))
    .filter((r) => r.code && r.name_ko);

  upsertListings(listings);
  console.log('[krx:update] upserted', listings.length, 'rows');
}

main().catch((e) => {
  console.error('[krx:update] failed:', e?.message || e);
  process.exit(1);
});

