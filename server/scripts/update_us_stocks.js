/* eslint-disable no-console */
const { initDb, db } = require('../db');
const XLSX = require('xlsx');

const SP500_CSV_URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv';
const NASDAQ_CSV_URL = 'https://www.nasdaq.com/market-activity/stocks/screener';

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS us_stock_listings (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      exchange TEXT,
      sector TEXT,
      industry TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

function parseCSV(csv) {
  const lines = csv.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    if (values.length !== headers.length) continue;
    
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

async function downloadSP500() {
  console.log('[US Update] Downloading S&P 500 list...');
  const res = await fetch(SP500_CSV_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/csv',
    },
  });
  
  if (!res.ok) {
    throw new Error(`S&P 500 download failed: ${res.status}`);
  }
  
  const csv = await res.text();
  const rows = parseCSV(csv);
  
  const stmt = db.prepare(`
    INSERT INTO us_stock_listings (symbol, name, exchange, sector, industry, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      exchange = excluded.exchange,
      sector = excluded.sector,
      industry = excluded.industry,
      updated_at = excluded.updated_at
  `);
  
  const now = new Date().toISOString();
  let count = 0;
  
  rows.forEach((row) => {
    const symbol = (row.Symbol || row.symbol || '').trim().toUpperCase();
    const name = (row.Name || row.name || '').trim();
    const sector = (row.Sector || row.sector || '').trim();
    const industry = (row['GICS Sub-Industry'] || row.industry || '').trim();
    
    // 한국 주식 필터링 (.KS, .KQ, 6자리 숫자)
    if (symbol && name) {
      const isKorean = symbol.includes('.KS') || symbol.includes('.KQ') || /^\d{6}$/.test(symbol);
      if (!isKorean) {
        stmt.run(symbol, name, 'NYSE/NASDAQ', sector, industry, now);
        count++;
      }
    }
  });
  
  console.log(`[US Update] Added ${count} S&P 500 stocks`);
  return count;
}

async function downloadNASDAQ() {
  console.log('[US Update] Downloading NASDAQ list...');
  // NASDAQ는 공식 CSV가 없으므로 S&P 500만 사용
  // 필요시 다른 소스 추가 가능
  console.log('[US Update] NASDAQ download skipped (use S&P 500 list)');
  return 0;
}

async function main() {
  initDb();
  ensureTable();
  
  try {
    const sp500Count = await downloadSP500();
    const nasdaqCount = await downloadNASDAQ();
    
    console.log(`[US Update] Total: ${sp500Count + nasdaqCount} stocks added/updated`);
  } catch (error) {
    console.error('[US Update] Failed:', error?.message || error);
    process.exit(1);
  }
}

main();
